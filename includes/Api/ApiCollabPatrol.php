<?php

namespace MediaWiki\Extension\CollabPatrol\Api;

use ApiBase;
use ApiMain;
use MediaWiki\Extension\CollabPatrol\CollabPatrolStore;
use MediaWiki\Extension\CollabPatrol\MentionParser;
use MediaWiki\Extension\CollabPatrol\Notifications\MentionNotifier;
use MediaWiki\Revision\RevisionStore;
use MediaWiki\User\UserFactory;
use Wikimedia\ParamValidator\ParamValidator;
use Wikimedia\Rdbms\IDBAccessObject;
use Wikimedia\Rdbms\ILoadBalancer;

class ApiCollabPatrol extends ApiBase {

	/** Sub-actions that modify data: POST + CSRF token + wiki block check. */
	private const WRITE_ACTIONS = [ 'set', 'remove', 'chat_post', 'chat_delete' ];

	private CollabPatrolStore $store;
	private RevisionStore $revisionStore;
	private UserFactory $userFactory;

	public function __construct(
		ApiMain $main,
		string $action,
		ILoadBalancer $lb,
		UserFactory $userFactory,
		RevisionStore $revisionStore
	) {
		parent::__construct( $main, $action );
		$this->store = new CollabPatrolStore( $lb, $this->getConfig() );
		$this->revisionStore = $revisionStore;
		$this->userFactory = $userFactory;
	}

	public function execute(): void {
		$this->checkUserRightsAny( 'collabpatrol-use' );
		$params = $this->extractRequestParams();
		$subaction = $params['subaction'];
		$user = $this->getUser();

		if ( in_array( $subaction, self::WRITE_ACTIONS, true ) ) {
			$this->checkNotBlocked( $user );
		}

		switch ( $subaction ) {
			case 'get':
				$this->executeGet( $params );
				break;
			case 'set':
				$this->executeSet( $params, $user );
				break;
			case 'remove':
				$this->executeRemove( $params, $user );
				break;
			case 'history':
				$this->executeHistory( $params );
				break;
			case 'list':
				$this->executeList( $params );
				break;
			case 'stats':
				$this->executeStats();
				break;
			case 'batchget':
				$this->executeBatchGet( $params );
				break;
			case 'chat_get':
				$this->executeChatGet( $params, $user );
				break;
			case 'chat_post':
				$this->executeChatPost( $params, $user );
				break;
			case 'chat_delete':
				$this->executeChatDelete( $params, $user );
				break;
			default:
				$this->dieWithError( 'apierror-invalidparameter', 'subaction' );
		}
	}

	private function executeGet( array $params ): void {
		$this->getResult()->addValue( null, 'collabpatrol', [
			'entry' => $this->store->getEntryFull( (int)$params['revid'] ),
		] );
	}

	/**
	 * Every write action re-checks, at the moment it is performed, that the user is
	 * not blocked on the wiki (the extension has no block system of its own).
	 */
	private function checkNotBlocked( $user ): void {
		$block = $user->getBlock( IDBAccessObject::READ_LATEST );
		if ( $block && $block->isSitewide() ) {
			$this->dieWithError( 'apierror-blocked', 'blocked' );
		}
	}

	private function executeSet( array $params, $user ): void {
		$this->requirePostedParameters( [ 'revid', 'status' ] );
		$revId = (int)$params['revid'];
		$status = $params['status'];
		$comment = $params['comment'] ?? '';
		$allowedStatuses = [ 'pending', 'in_progress', 'finished' ];
		if ( !in_array( $status, $allowedStatuses, true ) ) {
			$this->dieWithError( 'apierror-invalidparameter', 'status' );
		}
		$rev = $this->revisionStore->getRevisionById( $revId );
		if ( !$rev ) {
			$this->dieWithError( 'apierror-nosuchrevid', 'revid' );
		}
		$this->store->upsertEntry( $revId, $rev->getPageId(), $status, $user, $comment );
		if ( $status === 'finished' && $this->getConfig()->get( 'CollabPatrolAutoPatrol' ) ) {
			$this->patrolRevision( $revId );
		}
		// Return the up-to-date entry (read from the primary DB, no replica lag):
		// the client redraws from it without a second request.
		$this->getResult()->addValue( null, 'collabpatrol', [
			'result' => 'success',
			'revid' => $revId,
			'status' => $status,
			'entry' => $this->store->getEntryFull( $revId, true ),
		] );
	}

	private function executeRemove( array $params, $user ): void {
		$this->requirePostedParameters( [ 'revid' ] );
		if ( !$user->isAllowed( 'collabpatrol-admin' ) ) {
			$existing = $this->store->getEntry( (int)$params['revid'] );
			if ( !$existing || $existing['userText'] !== $user->getName() ) {
				$this->dieWithError( 'apierror-permissiondenied', 'notowner' );
			}
		}
		$this->store->deleteEntry( (int)$params['revid'], $user );
		$this->getResult()->addValue( null, 'collabpatrol', [ 'result' => 'success', 'entry' => null ] );
	}

	private function executeHistory( array $params ): void {
		$this->getResult()->addValue( null, 'collabpatrol', [
			'history' => $this->store->getHistory( (int)$params['revid'] )
		] );
	}

	private function executeList( array $params ): void {
		$this->getResult()->addValue( null, 'collabpatrol', [
			'entries' => $this->store->getEntriesByStatus( $params['filterstatus'] ?? 'all' )
		] );
	}

	private function executeStats(): void {
		$this->getResult()->addValue( null, 'collabpatrol', [
			'stats' => $this->store->getStats()
		] );
	}

	private function executeBatchGet( array $params ): void {
		$revIds = array_filter( array_map( 'intval', explode( '|', $params['revids'] ) ) );
		if ( count( $revIds ) > 500 ) {
			$revIds = array_slice( $revIds, 0, 500 );
		}
		// A plain list (not keyed by revision ID) so that the JSON stays an array.
		$this->getResult()->addValue( null, 'collabpatrol', [
			'entries' => array_values( $this->store->getEntriesForRevisions( $revIds ) )
		] );
	}

	private function executeChatGet( array $params, $user ): void {
		if ( !$this->getConfig()->get( 'CollabPatrolChatEnabled' ) ) {
			$this->dieWithError( 'apierror-disabled', 'chat' );
		}
		$revId = (int)$params['revid'];
		$afterId = max( 0, (int)$params['afterid'] );
		$messages = $this->store->getChatMessages( $revId, $afterId );
		$isMod = $this->isChatModerator( $user );

		// Only messages that contain an "@" can hold a mention: skip the lookup otherwise.
		$texts = [];
		foreach ( $messages as $i => $msg ) {
			if ( !$msg['deleted'] && strpos( $msg['message'], '@' ) !== false ) {
				$texts[$i] = $msg['message'];
			}
		}
		$resolvedMentions = $texts ? $this->resolveMentions( $texts ) : [];

		$sanitized = [];
		$lastId = $afterId;
		foreach ( $messages as $i => $msg ) {
			$lastId = max( $lastId, $msg['id'] );
			if ( $msg['deleted'] ) {
				$sanitized[] = [
					'id' => $msg['id'],
					'deleted' => true,
					'timestamp' => $msg['timestamp'],
					'deletedBy' => $isMod ? $msg['deletedBy'] : '',
					'userText' => $isMod ? $msg['userText'] : '',
				];
			} else {
				$msg['mentions'] = array_map( static function ( array $m ) {
					return [ 'raw' => $m['raw'], 'name' => $m['name'] ];
				}, $resolvedMentions[$i] ?? [] );
				$sanitized[] = $msg;
			}
		}

		$this->getResult()->addValue( null, 'collabpatrol', [
			'messages' => $sanitized,
			// Messages already known to the client that have been deleted since.
			'deleted' => $afterId > 0 ? $this->store->getDeletedChatIds( $revId, $afterId ) : [],
			'lastId' => $lastId,
			'count' => $this->store->getChatCount( $revId ),
			'isMod' => $isMod,
			'chatEnabled' => true,
		] );
	}

	private function executeChatPost( array $params, $user ): void {
		$this->requirePostedParameters( [ 'revid', 'message' ] );

		if ( !$this->getConfig()->get( 'CollabPatrolChatEnabled' ) ) {
			$this->dieWithError( 'apierror-disabled', 'chat' );
		}

		$revId = (int)$params['revid'];
		$message = trim( $params['message'] ?? '' );

		if ( $message === '' ) {
			$this->dieWithError( 'apierror-missingparam', 'message' );
		}

		$maxLen = (int)$this->getConfig()->get( 'CollabPatrolChatMaxLength' );
		if ( mb_strlen( $message ) > $maxLen ) {
			$this->dieWithError( [ 'collabpatrol-chat-too-long' ], 'message_too_long' );
		}

		$bannedWords = $this->getConfig()->get( 'CollabPatrolChatBannedWords' );
		if ( is_array( $bannedWords ) ) {
			foreach ( $bannedWords as $word ) {
				if ( $word !== '' && mb_stripos( $message, $word ) !== false ) {
					$this->dieWithError( [ 'collabpatrol-chat-banned-word' ], 'banned_word' );
				}
			}
		}

		$entry = $this->store->getEntry( $revId );
		if ( !$entry || $entry['status'] === 'finished' ) {
			$this->dieWithError( 'apierror-invalidparameter', 'revid' );
		}

		$msgId = $this->store->addChatMessage( $revId, $user, $message );
		$mentioned = $this->notifyMentions( $revId, (int)$entry['pageId'], $user, $message );
		$this->getResult()->addValue( null, 'collabpatrol', [
			'result' => 'success',
			'msgId' => $msgId,
			'mentioned' => $mentioned,
			'userText' => $user->getName(),
			'timestamp' => time(),
			'message' => $message,
		] );
	}

	/**
	 * Resolves @mentions to existing users, with a single DB query.
	 *
	 * @param string[] $texts Message texts, keyed by any key
	 * @return array[] Same keys => list of [ 'raw', 'name', 'id' ] for existing users only
	 */
	private function resolveMentions( array $texts ): array {
		$candidates = [];
		$names = [];
		foreach ( $texts as $key => $text ) {
			foreach ( MentionParser::extract( $text ) as $candidate ) {
				$target = $this->userFactory->newFromName( $candidate['name'] );
				if ( !$target ) {
					continue;
				}
				$candidates[$key][] = [ 'raw' => $candidate['raw'], 'name' => $target->getName() ];
				$names[] = $target->getName();
			}
		}

		$ids = $this->store->getUserIdsByName( $names );
		$resolved = [];
		foreach ( $candidates as $key => $list ) {
			foreach ( $list as $item ) {
				if ( isset( $ids[$item['name']] ) ) {
					$item['id'] = $ids[$item['name']];
					$resolved[$key][] = $item;
				}
			}
		}
		return $resolved;
	}

	/**
	 * Sends an Echo notification to every patroller mentioned in a chat message.
	 *
	 * @return string[] Names of the users who were notified
	 */
	private function notifyMentions( int $revId, int $pageId, $user, string $message ): array {
		$resolved = $this->resolveMentions( [ $message ] )[0] ?? [];

		$recipients = [];
		foreach ( $resolved as $item ) {
			if ( $item['name'] === $user->getName() || isset( $recipients[$item['id']] ) ) {
				continue;
			}
			$target = $this->userFactory->newFromId( $item['id'] );
			if ( !$target->isAllowed( 'collabpatrol-use' ) ) {
				continue;
			}
			$recipients[$item['id']] = $item['name'];
			if ( count( $recipients ) >= MentionParser::MAX_MENTIONS ) {
				break;
			}
		}

		if ( $recipients && $this->getConfig()->get( 'CollabPatrolEnableEcho' ) ) {
			MentionNotifier::notify( $pageId, $revId, $user, $message, array_keys( $recipients ) );
		}

		return array_values( $recipients );
	}

	private function executeChatDelete( array $params, $user ): void {
		$this->requirePostedParameters( [ 'msgid' ] );
		if ( !$this->getConfig()->get( 'CollabPatrolChatEnabled' ) ) {
			$this->dieWithError( 'apierror-disabled', 'chat' );
		}

		$msgId = (int)$params['msgid'];
		if ( !$this->isChatModerator( $user ) ) {
			$msg = $this->store->getChatMessage( $msgId );
			if ( !$msg || $msg['userText'] !== $user->getName() ) {
				$this->dieWithError( 'apierror-permissiondenied', 'notowner' );
			}
		}

		$ok = $this->store->deleteChatMessage( $msgId, $user->getName() );
		$this->getResult()->addValue( null, 'collabpatrol', [
			'result' => $ok ? 'success' : 'notfound',
		] );
	}

	private function isChatModerator( $user ): bool {
		if ( $user->isAllowed( 'collabpatrol-admin' ) ) {
			return true;
		}
		if ( $user->isAllowed( 'collabpatrol-chatmod' ) ) {
			return true;
		}
		$moderators = $this->getConfig()->get( 'CollabPatrolChatModerators' );
		if ( is_array( $moderators ) && in_array( $user->getName(), $moderators, true ) ) {
			return true;
		}
		return false;
	}

	private function patrolRevision( int $revId ): void {
		$api = new \ApiMain(
			new \FauxRequest( [
				'action' => 'patrol',
				'revid' => $revId,
				'token' => $this->getUser()->getEditToken( 'patrol' ),
				'format' => 'json',
			], true ),
			false
		);
		try {
			$api->execute();
		} catch ( \Exception $e ) {
		}
	}

	public function getAllowedParams(): array {
		return [
			'subaction' => [
				ParamValidator::PARAM_REQUIRED => true,
				ParamValidator::PARAM_TYPE => [
					'get', 'set', 'remove', 'history', 'list', 'stats', 'batchget',
					'chat_get', 'chat_post', 'chat_delete',
				],
			],
			'revid' => [ ParamValidator::PARAM_TYPE => 'integer' ],
			'revids' => [ ParamValidator::PARAM_TYPE => 'string' ],
			'status' => [ ParamValidator::PARAM_TYPE => [ 'pending', 'in_progress', 'finished' ] ],
			'comment' => [ ParamValidator::PARAM_TYPE => 'string', ParamValidator::PARAM_DEFAULT => '' ],
			'filterstatus' => [
				ParamValidator::PARAM_TYPE => [ 'all', 'pending', 'in_progress', 'finished' ],
				ParamValidator::PARAM_DEFAULT => 'all',
			],
			'message' => [ ParamValidator::PARAM_TYPE => 'string', ParamValidator::PARAM_DEFAULT => '' ],
			'msgid' => [ ParamValidator::PARAM_TYPE => 'integer' ],
			'afterid' => [ ParamValidator::PARAM_TYPE => 'integer', ParamValidator::PARAM_DEFAULT => 0 ],
		];
	}

	public function needsToken(): string {
		$sub = $this->getRequest()->getVal( 'subaction', '' );
		return in_array( $sub, self::WRITE_ACTIONS, true )
			? 'csrf'
			: '';
	}

	public function isWriteMode(): bool {
		$sub = $this->getRequest()->getVal( 'subaction', '' );
		return in_array( $sub, self::WRITE_ACTIONS, true );
	}

	public function mustBePosted(): bool {
		$sub = $this->getRequest()->getVal( 'subaction', '' );
		return in_array( $sub, self::WRITE_ACTIONS, true );
	}
}
