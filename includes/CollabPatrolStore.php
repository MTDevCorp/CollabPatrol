<?php

namespace MediaWiki\Extension\CollabPatrol;

use MediaWiki\Config\Config;
use MediaWiki\User\UserIdentity;
use Wikimedia\Rdbms\ILoadBalancer;
use Wikimedia\Timestamp\ConvertibleTimestamp;

class CollabPatrolStore {

	private ILoadBalancer $lb;
	private Config $config;

	public function __construct( ILoadBalancer $lb, Config $config ) {
		$this->lb = $lb;
		$this->config = $config;
	}

	public function getEntry( int $revId ): ?array {
		$db = $this->lb->getConnection( DB_REPLICA );
		$row = $db->selectRow(
			'collab_patrol',
			'*',
			[ 'cp_rev_id' => $revId ],
			__METHOD__
		);
		if ( !$row ) {
			return null;
		}
		return $this->rowToArray( $row );
	}

	public function getEntriesByStatus( string $status, int $limit = 100 ): array {
		$db = $this->lb->getConnection( DB_REPLICA );
		$conds = [];
		if ( $status !== 'all' ) {
			$conds['cp_status'] = $status;
		}
		$res = $db->select(
			'collab_patrol',
			'*',
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

	public function getEntriesForRevisions( array $revIds ): array {
		if ( !$revIds ) {
			return [];
		}
		$db = $this->lb->getConnection( DB_REPLICA );
		$res = $db->select(
			'collab_patrol',
			'*',
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

	public function deleteEntry( int $revId ): bool {
		$db = $this->lb->getConnection( DB_PRIMARY );
		$db->delete(
			'collab_patrol',
			[ 'cp_rev_id' => $revId ],
			__METHOD__
		);

		if ( $this->config->get( 'CollabPatrolChatAutoDelete' ) ) {
			$this->deleteChatForRevision( $revId );
		}

		return true;
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

	public function getHistory( int $revId ): array {
		$db = $this->lb->getConnection( DB_REPLICA );
		$res = $db->select(
			'collab_patrol_history',
			'*',
			[ 'cph_rev_id' => $revId ],
			__METHOD__,
			[ 'ORDER BY' => 'cph_timestamp ASC' ]
		);
		$history = [];
		foreach ( $res as $row ) {
			$history[] = [
				'action' => $row->cph_action,
				'userId' => (int)$row->cph_user_id,
				'userText' => $row->cph_user_text,
				'comment' => $row->cph_comment,
				'timestamp' => wfTimestamp( TS_UNIX, $row->cph_timestamp ),
			];
		}
		return $history;
	}

	public function getStats(): array {
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
		$db->delete(
			'collab_patrol',
			[ 'cp_expires < ' . $db->addQuotes( $now ) ],
			__METHOD__
		);
		return $db->affectedRows();
	}

	public function getChatMessages( int $revId ): array {
		$db = $this->lb->getConnection( DB_REPLICA );
		$res = $db->select(
			'collab_patrol_chat',
			'*',
			[ 'cpc_rev_id' => $revId ],
			__METHOD__,
			[ 'ORDER BY' => 'cpc_timestamp ASC', 'LIMIT' => 200 ]
		);
		$messages = [];
		foreach ( $res as $row ) {
			$messages[] = $this->chatRowToArray( $row );
		}
		return $messages;
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

	public function addChatMentions( int $msgId, int $revId, UserIdentity $fromUser, array $targets ): void {
		if ( !$targets ) {
			return;
		}
		$db = $this->lb->getConnection( DB_PRIMARY );
		$rows = [];
		$seen = [];
		foreach ( $targets as $target ) {
			$normalized = str_replace( '_', ' ', trim( $target->getName() ) );
			$key = strtolower( $normalized );
			if ( $normalized === '' || isset( $seen[$key] ) ) {
				continue;
			}
			$seen[$key] = true;
			$rows[] = [
				'cpcm_msg_id' => $msgId,
				'cpcm_rev_id' => $revId,
				'cpcm_target_user_id' => $target->getId(),
				'cpcm_target_user_text' => $normalized,
				'cpcm_from_user_id' => $fromUser->getId(),
				'cpcm_from_user_text' => $fromUser->getName(),
				'cpcm_timestamp' => ConvertibleTimestamp::now( TS_MW ),
			];
		}
		if ( !$rows ) {
			return;
		}
		foreach ( $rows as $row ) {
			$db->upsert(
				'collab_patrol_chat_mention',
				$row,
				[ [ 'cpcm_msg_id', 'cpcm_target_user_text' ] ],
				[],
				__METHOD__
			);
		}
	}

	public function getActiveMentionsForUser( string $userText, int $limit = 50 ): array {
		$db = $this->lb->getConnection( DB_REPLICA );
		$res = $db->select(
			[ 'm' => 'collab_patrol_chat_mention', 'cp' => 'collab_patrol', 'c' => 'collab_patrol_chat' ],
			[
				'm.cpcm_id',
				'm.cpcm_msg_id',
				'm.cpcm_rev_id',
				'm.cpcm_from_user_text',
				'm.cpcm_timestamp',
				'cp.cp_status',
				'cp.cp_comment',
				'cp.cp_user_text',
				'cp.cp_timestamp',
				'c.cpc_message',
				'c.cpc_deleted',
			],
			[
				'm.cpcm_target_user_text' => $userText,
				'cp.cp_status' => [ 'pending', 'in_progress' ],
				'c.cpc_deleted' => 0,
			],
			__METHOD__,
			[
				'ORDER BY' => 'm.cpcm_timestamp DESC',
				'LIMIT' => $limit,
			],
			[
				'cp' => [ 'JOIN', 'cp.cp_rev_id = m.cpcm_rev_id' ],
				'c' => [ 'JOIN', 'c.cpc_id = m.cpcm_msg_id' ],
			]
		);
		$mentions = [];
		foreach ( $res as $row ) {
			$mentions[] = [
				'mentionId' => (int)$row->cpcm_id,
				'msgId' => (int)$row->cpcm_msg_id,
				'revId' => (int)$row->cpcm_rev_id,
				'fromUserText' => $row->cpcm_from_user_text,
				'mentionTimestamp' => wfTimestamp( TS_UNIX, $row->cpcm_timestamp ),
				'status' => $row->cp_status,
				'entryComment' => $row->cp_comment,
				'entryUserText' => $row->cp_user_text,
				'entryTimestamp' => wfTimestamp( TS_UNIX, $row->cp_timestamp ),
				'message' => $row->cpc_message,
			];
		}
		return $mentions;
	}

	public function getUserInProgressEntries( string $userText, int $limit = 50 ): array {
		$db = $this->lb->getConnection( DB_REPLICA );
		$res = $db->select(
			'collab_patrol',
			'*',
			[
				'cp_user_text' => $userText,
				'cp_status' => 'in_progress',
			],
			__METHOD__,
			[
				'ORDER BY' => 'cp_timestamp DESC',
				'LIMIT' => $limit,
			]
		);
		$entries = [];
		foreach ( $res as $row ) {
			$entries[] = $this->rowToArray( $row );
		}
		return $entries;
	}

	public function getSuggestedPendingEntries( string $excludeUserText, int $limit = 25 ): array {
		$db = $this->lb->getConnection( DB_REPLICA );
		$res = $db->select(
			'collab_patrol',
			'*',
			[
				'cp_status' => 'pending',
				'cp_user_text != ' . $db->addQuotes( $excludeUserText ),
			],
			__METHOD__,
			[
				'ORDER BY' => 'cp_timestamp ASC',
				'LIMIT' => $limit,
			]
		);
		$entries = [];
		foreach ( $res as $row ) {
			$entries[] = $this->rowToArray( $row );
		}
		return $entries;
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
		$db->delete(
			'collab_patrol_chat_mention',
			[ 'cpcm_rev_id' => $revId ],
			__METHOD__
		);
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

	public function banChatUser( string $userText, string $bannedBy, string $reason = '' ): void {
		$db = $this->lb->getConnection( DB_PRIMARY );
		$db->upsert(
			'collab_patrol_chat_ban',
			[
				'cpcb_user_text' => $userText,
				'cpcb_banned_by' => $bannedBy,
				'cpcb_reason' => $reason,
				'cpcb_timestamp' => ConvertibleTimestamp::now( TS_MW ),
			],
			[ [ 'cpcb_user_text' ] ],
			[
				'cpcb_banned_by' => $bannedBy,
				'cpcb_reason' => $reason,
				'cpcb_timestamp' => ConvertibleTimestamp::now( TS_MW ),
			],
			__METHOD__
		);
	}

	public function unbanChatUser( string $userText ): bool {
		$db = $this->lb->getConnection( DB_PRIMARY );
		$db->delete(
			'collab_patrol_chat_ban',
			[ 'cpcb_user_text' => $userText ],
			__METHOD__
		);
		return $db->affectedRows() > 0;
	}

	public function isUserChatBanned( string $userText ): bool {
		$db = $this->lb->getConnection( DB_REPLICA );
		$row = $db->selectRow(
			'collab_patrol_chat_ban',
			[ 'cpcb_id' ],
			[ 'cpcb_user_text' => $userText ],
			__METHOD__
		);
		return (bool)$row;
	}

	public function getChatBan( string $userText ): ?array {
		$db = $this->lb->getConnection( DB_REPLICA );
		$row = $db->selectRow(
			'collab_patrol_chat_ban',
			'*',
			[ 'cpcb_user_text' => $userText ],
			__METHOD__
		);
		if ( !$row ) {
			return null;
		}
		return [
			'userText' => $row->cpcb_user_text,
			'bannedBy' => $row->cpcb_banned_by,
			'reason' => $row->cpcb_reason,
			'timestamp' => wfTimestamp( TS_UNIX, $row->cpcb_timestamp ),
		];
	}

	public function getChatBansForUsers( array $userTexts ): array {
		if ( !$userTexts ) {
			return [];
		}
		$db = $this->lb->getConnection( DB_REPLICA );
		$res = $db->select(
			'collab_patrol_chat_ban',
			'*',
			[ 'cpcb_user_text' => array_values( array_unique( $userTexts ) ) ],
			__METHOD__
		);
		$bans = [];
		foreach ( $res as $row ) {
			$bans[$row->cpcb_user_text] = [
				'userText' => $row->cpcb_user_text,
				'bannedBy' => $row->cpcb_banned_by,
				'reason' => $row->cpcb_reason,
				'timestamp' => wfTimestamp( TS_UNIX, $row->cpcb_timestamp ),
			];
		}
		return $bans;
	}

	private function rowToArray( object $row ): array {
		return [
			'revId' => (int)$row->cp_rev_id,
			'pageId' => (int)$row->cp_page_id,
			'status' => $row->cp_status,
			'userId' => (int)$row->cp_user_id,
			'userText' => $row->cp_user_text,
			'comment' => $row->cp_comment,
			'timestamp' => wfTimestamp( TS_UNIX, $row->cp_timestamp ),
			'expires' => wfTimestamp( TS_UNIX, $row->cp_expires ),
		];
	}

	private function chatRowToArray( object $row ): array {
		return [
			'id' => (int)$row->cpc_id,
			'revId' => (int)$row->cpc_rev_id,
			'userId' => (int)$row->cpc_user_id,
			'userText' => $row->cpc_user_text,
			'message' => $row->cpc_message,
			'timestamp' => wfTimestamp( TS_UNIX, $row->cpc_timestamp ),
			'deleted' => (bool)$row->cpc_deleted,
			'deletedBy' => $row->cpc_deleted_by,
		];
	}
}
