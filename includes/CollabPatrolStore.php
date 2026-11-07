<?php

namespace MediaWiki\Extension\CollabPatrol;

use MediaWiki\Config\Config;
use MediaWiki\MediaWikiServices;
use MediaWiki\User\UserIdentity;
use Wikimedia\Rdbms\ILoadBalancer;
use Wikimedia\Timestamp\ConvertibleTimestamp;

class CollabPatrolStore {

	/** Seconds during which the dashboard statistics are cached. */
	private const STATS_TTL = 60;

	private const ENTRY_FIELDS = [
		'cp_rev_id', 'cp_page_id', 'cp_status', 'cp_user_id', 'cp_user_text',
		'cp_comment', 'cp_timestamp', 'cp_expires',
	];

	private ILoadBalancer $lb;
	private Config $config;

	public function __construct( ILoadBalancer $lb, Config $config ) {
		$this->lb = $lb;
		$this->config = $config;
	}

	/**
	 * Builds a store from the global services (hooks, jobs, maintenance scripts).
	 */
	public static function newFromServices(): self {
		$services = MediaWikiServices::getInstance();
		return new self( $services->getDBLoadBalancer(), $services->getMainConfig() );
	}

	public function getEntry( int $revId, bool $fromPrimary = false ): ?array {
		$db = $this->lb->getConnection( $fromPrimary ? DB_PRIMARY : DB_REPLICA );
		$row = $db->selectRow(
			'collab_patrol',
			self::ENTRY_FIELDS,
			[ 'cp_rev_id' => $revId ],
			__METHOD__
		);
		return $row ? $this->rowToArray( $row ) : null;
	}

	/**
	 * Entry + history + number of visible chat messages, in one call.
	 * Everything the client needs to draw the interface without a second request.
	 */
	public function getEntryFull( int $revId, bool $fromPrimary = false ): ?array {
		$entry = $this->getEntry( $revId, $fromPrimary );
		if ( !$entry ) {
			return null;
		}
		$entry['history'] = $this->getHistory( $revId, $fromPrimary );
		$entry['chatCount'] = $entry['status'] === 'finished'
			? 0
			: $this->getChatCount( $revId, $fromPrimary );
		return $entry;
	}

	public function getEntriesByStatus( string $status, int $limit = 100 ): array {
		$db = $this->lb->getConnection( DB_REPLICA );
		$conds = [];
		if ( $status !== 'all' ) {
			$conds['cp_status'] = $status;
		}
		$res = $db->select(
			'collab_patrol',
			self::ENTRY_FIELDS,
			$conds,
			__METHOD__,
			[ 'ORDER BY' => 'cp_timestamp DESC', 'LIMIT' => $limit ]
		);
		$entries = [];
		foreach ( $res as $row ) {
			$entries[] = $this->rowToArray( $row );
		}
		return $entries;
	}

	/**
	 * @param int[] $revIds
	 * @return array[] Entries keyed by revision ID
	 */
	public function getEntriesForRevisions( array $revIds ): array {
		if ( !$revIds ) {
			return [];
		}
		$db = $this->lb->getConnection( DB_REPLICA );
		$res = $db->select(
			'collab_patrol',
			self::ENTRY_FIELDS,
			[ 'cp_rev_id' => $revIds ],
			__METHOD__
		);
		$entries = [];
		foreach ( $res as $row ) {
			$entries[(int)$row->cp_rev_id] = $this->rowToArray( $row );
		}
		return $entries;
	}

	public function upsertEntry( int $revId, int $pageId, string $status, UserIdentity $user, string $comment ): bool {
		$db = $this->lb->getConnection( DB_PRIMARY );
		$expirationSeconds = $this->config->get( 'CollabPatrolExpirationDelay' );
		$now = ConvertibleTimestamp::now( TS_MW );
		$expires = wfTimestamp( TS_MW, time() + $expirationSeconds );

		$db->upsert(
			'collab_patrol',
			[
				'cp_rev_id' => $revId,
				'cp_page_id' => $pageId,
				'cp_status' => $status,
				'cp_user_id' => $user->getId(),
				'cp_user_text' => $user->getName(),
				'cp_comment' => $comment,
				'cp_timestamp' => $now,
				'cp_expires' => $expires,
			],
			[ [ 'cp_rev_id' ] ],
			[
				'cp_status' => $status,
				'cp_user_id' => $user->getId(),
				'cp_user_text' => $user->getName(),
				'cp_comment' => $comment,
				'cp_timestamp' => $now,
				'cp_expires' => $expires,
			],
			__METHOD__
		);

		$this->addHistoryEntry( $revId, $status, $user, $comment );

		if ( $status === 'finished' && $this->config->get( 'CollabPatrolChatAutoDelete' ) ) {
			$this->deleteChatForRevision( $revId );
		}

		return true;
	}

	/**
	 * Removes an entry. The removal is recorded in the history ("removed") when
	 * an entry actually existed.
	 */
	public function deleteEntry( int $revId, ?UserIdentity $user = null ): bool {
		$db = $this->lb->getConnection( DB_PRIMARY );
		$db->delete(
			'collab_patrol',
			[ 'cp_rev_id' => $revId ],
			__METHOD__
		);
		$existed = $db->affectedRows() > 0;

		if ( $existed && $user ) {
			$this->addHistoryEntry( $revId, 'removed', $user, '' );
		}

		if ( $this->config->get( 'CollabPatrolChatAutoDelete' ) ) {
			$this->deleteChatForRevision( $revId );
		}

		return $existed;
	}

	public function addHistoryEntry( int $revId, string $action, UserIdentity $user, string $comment ): void {
		$db = $this->lb->getConnection( DB_PRIMARY );
		$db->insert(
			'collab_patrol_history',
			[
				'cph_rev_id' => $revId,
				'cph_action' => $action,
				'cph_user_id' => $user->getId(),
				'cph_user_text' => $user->getName(),
				'cph_comment' => $comment,
				'cph_timestamp' => ConvertibleTimestamp::now( TS_MW ),
			],
			__METHOD__
		);
	}

	public function getHistory( int $revId, bool $fromPrimary = false ): array {
		$db = $this->lb->getConnection( $fromPrimary ? DB_PRIMARY : DB_REPLICA );
		$res = $db->select(
			'collab_patrol_history',
			[ 'cph_action', 'cph_user_id', 'cph_user_text', 'cph_comment', 'cph_timestamp' ],
			[ 'cph_rev_id' => $revId ],
			__METHOD__,
			[ 'ORDER BY' => 'cph_id ASC', 'LIMIT' => 100 ]
		);
		$history = [];
		foreach ( $res as $row ) {
			$history[] = [
				'action' => $row->cph_action,
				'userId' => (int)$row->cph_user_id,
				'userText' => $row->cph_user_text,
				'comment' => $row->cph_comment,
				'timestamp' => (int)wfTimestamp( TS_UNIX, $row->cph_timestamp ),
			];
		}
		return $history;
	}

	/**
	 * Dashboard statistics, cached for a short time (the page is read far more
	 * often than the numbers change).
	 */
	public function getStats(): array {
		$cache = MediaWikiServices::getInstance()->getMainWANObjectCache();
		return $cache->getWithSetCallback(
			$cache->makeKey( 'collabpatrol', 'stats' ),
			self::STATS_TTL,
			function () {
				return $this->computeStats();
			}
		);
	}

	private function computeStats(): array {
		$db = $this->lb->getConnection( DB_REPLICA );
		$counts = [];
		$res = $db->select(
			'collab_patrol',
			[ 'cp_status', 'count' => 'COUNT(*)' ],
			[],
			__METHOD__,
			[ 'GROUP BY' => 'cp_status' ]
		);
		foreach ( $res as $row ) {
			$counts[$row->cp_status] = (int)$row->count;
		}

		$total = $db->selectField( 'collab_patrol_history', 'COUNT(*)', [], __METHOD__ );
		$topRes = $db->select(
			'collab_patrol_history',
			[ 'cph_user_text', 'actions' => 'COUNT(*)' ],
			[ 'cph_action' => 'finished' ],
			__METHOD__,
			[ 'GROUP BY' => 'cph_user_text', 'ORDER BY' => 'actions DESC', 'LIMIT' => 10 ]
		);
		$topPatrollers = [];
		foreach ( $topRes as $row ) {
			$topPatrollers[] = [
				'user' => $row->cph_user_text,
				'count' => (int)$row->actions,
			];
		}

		return [
			'pending' => $counts['pending'] ?? 0,
			'in_progress' => $counts['in_progress'] ?? 0,
			'finished' => $counts['finished'] ?? 0,
			'totalHistory' => (int)$total,
			'topPatrollers' => $topPatrollers,
		];
	}

	public function purgeExpired(): int {
		$db = $this->lb->getConnection( DB_PRIMARY );
		$now = ConvertibleTimestamp::now( TS_MW );
		$cond = [ 'cp_expires < ' . $db->addQuotes( $now ) ];

		// Also clean the chat of the expired entries (nothing else would ever delete it).
		$expiredIds = $db->selectFieldValues( 'collab_patrol', 'cp_rev_id', $cond, __METHOD__ );

		$db->delete( 'collab_patrol', $cond, __METHOD__ );
		$count = $db->affectedRows();

		if ( $expiredIds ) {
			$db->delete(
				'collab_patrol_chat',
				[ 'cpc_rev_id' => array_map( 'intval', $expiredIds ) ],
				__METHOD__
			);
		}
		return $count;
	}

	/**
	 * Chat messages of a revision, oldest first.
	 *
	 * @param int $revId
	 * @param int $afterId Only return messages with an ID greater than this (incremental polling)
	 */
	public function getChatMessages( int $revId, int $afterId = 0 ): array {
		$db = $this->lb->getConnection( DB_REPLICA );
		$conds = [ 'cpc_rev_id' => $revId ];
		if ( $afterId > 0 ) {
			$conds[] = 'cpc_id > ' . (int)$afterId;
		}
		$res = $db->select(
			'collab_patrol_chat',
			'*',
			$conds,
			__METHOD__,
			[ 'ORDER BY' => 'cpc_id ASC', 'LIMIT' => 200 ]
		);
		$messages = [];
		foreach ( $res as $row ) {
			$messages[] = $this->chatRowToArray( $row );
		}
		return $messages;
	}

	/**
	 * IDs (<= $maxId) of the deleted messages of a revision, so that a client that
	 * already displayed them can turn them into tombstones.
	 *
	 * @return int[]
	 */
	public function getDeletedChatIds( int $revId, int $maxId ): array {
		$db = $this->lb->getConnection( DB_REPLICA );
		$ids = $db->selectFieldValues(
			'collab_patrol_chat',
			'cpc_id',
			[ 'cpc_rev_id' => $revId, 'cpc_deleted' => 1, 'cpc_id <= ' . (int)$maxId ],
			__METHOD__
		);
		return array_map( 'intval', $ids );
	}

	public function getChatCount( int $revId, bool $fromPrimary = false ): int {
		$db = $this->lb->getConnection( $fromPrimary ? DB_PRIMARY : DB_REPLICA );
		return (int)$db->selectField(
			'collab_patrol_chat',
			'COUNT(*)',
			[ 'cpc_rev_id' => $revId, 'cpc_deleted' => 0 ],
			__METHOD__
		);
	}

	public function addChatMessage( int $revId, UserIdentity $user, string $message ): int {
		$db = $this->lb->getConnection( DB_PRIMARY );
		$db->insert(
			'collab_patrol_chat',
			[
				'cpc_rev_id' => $revId,
				'cpc_user_id' => $user->getId(),
				'cpc_user_text' => $user->getName(),
				'cpc_message' => $message,
				'cpc_timestamp' => ConvertibleTimestamp::now( TS_MW ),
				'cpc_deleted' => 0,
				'cpc_deleted_by' => '',
				'cpc_deleted_at' => '',
			],
			__METHOD__
		);
		return $db->insertId();
	}

	public function deleteChatMessage( int $msgId, string $deletedBy ): bool {
		$db = $this->lb->getConnection( DB_PRIMARY );
		$db->update(
			'collab_patrol_chat',
			[
				'cpc_deleted' => 1,
				'cpc_deleted_by' => $deletedBy,
				'cpc_deleted_at' => ConvertibleTimestamp::now( TS_MW ),
			],
			[ 'cpc_id' => $msgId ],
			__METHOD__
		);
		return $db->affectedRows() > 0;
	}

	public function deleteChatForRevision( int $revId ): void {
		$db = $this->lb->getConnection( DB_PRIMARY );
		$db->delete(
			'collab_patrol_chat',
			[ 'cpc_rev_id' => $revId ],
			__METHOD__
		);
	}

	/**
	 * @param string[] $names Normalized user names
	 * @return int[] Map of existing user name => user ID
	 */
	public function getUserIdsByName( array $names ): array {
		$names = array_values( array_unique( array_map( 'strval', $names ) ) );
		if ( !$names ) {
			return [];
		}
		$db = $this->lb->getConnection( DB_REPLICA );
		$res = $db->select(
			'user',
			[ 'user_id', 'user_name' ],
			[ 'user_name' => $names ],
			__METHOD__
		);
		$ids = [];
		foreach ( $res as $row ) {
			$ids[$row->user_name] = (int)$row->user_id;
		}
		return $ids;
	}

	public function getChatMessage( int $msgId ): ?array {
		$db = $this->lb->getConnection( DB_REPLICA );
		$row = $db->selectRow(
			'collab_patrol_chat',
			'*',
			[ 'cpc_id' => $msgId ],
			__METHOD__
		);
		return $row ? $this->chatRowToArray( $row ) : null;
	}

	private function rowToArray( object $row ): array {
		return [
			'revId' => (int)$row->cp_rev_id,
			'pageId' => (int)$row->cp_page_id,
			'status' => $row->cp_status,
			'userId' => (int)$row->cp_user_id,
			'userText' => $row->cp_user_text,
			'comment' => $row->cp_comment,
			'timestamp' => (int)wfTimestamp( TS_UNIX, $row->cp_timestamp ),
			'expires' => (int)wfTimestamp( TS_UNIX, $row->cp_expires ),
		];
	}

	private function chatRowToArray( object $row ): array {
		return [
			'id' => (int)$row->cpc_id,
			'revId' => (int)$row->cpc_rev_id,
			'userId' => (int)$row->cpc_user_id,
			'userText' => $row->cpc_user_text,
			'message' => $row->cpc_message,
			'timestamp' => (int)wfTimestamp( TS_UNIX, $row->cpc_timestamp ),
			'deleted' => (bool)$row->cpc_deleted,
			'deletedBy' => $row->cpc_deleted_by,
		];
	}
}
