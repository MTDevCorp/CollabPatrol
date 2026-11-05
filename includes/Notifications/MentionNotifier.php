<?php

namespace MediaWiki\Extension\CollabPatrol\Notifications;

use MediaWiki\Extension\Notifications\Model\Event;
use MediaWiki\Logger\LoggerFactory;
use MediaWiki\MediaWikiServices;
use MediaWiki\Registration\ExtensionRegistry;

class MentionNotifier {

	public const EVENT_TYPE = 'collabpatrol-mention';

	/**
	 * Creates one Echo event notifying every recipient of a mention.
	 *
	 * @param int $pageId Page the patrolled revision belongs to
	 * @param int $revId Patrolled revision
	 * @param \MediaWiki\User\User $agent Author of the chat message
	 * @param string $message Chat message
	 * @param int[] $recipientIds User IDs to notify
	 * @return bool Whether an event was created
	 */
	public static function notify( int $pageId, int $revId, $agent, string $message, array $recipientIds ): bool {
		if ( !$recipientIds || !ExtensionRegistry::getInstance()->isLoaded( 'Echo' ) ) {
			return false;
		}

		$title = MediaWikiServices::getInstance()->getTitleFactory()->newFromID( $pageId );
		if ( !$title ) {
			return false;
		}

		try {
			Event::create( [
				'type' => self::EVENT_TYPE,
				'title' => $title,
				'agent' => $agent,
				'extra' => [
					'cp-revid' => $revId,
					'excerpt' => mb_strimwidth( $message, 0, 140, '…' ),
					'mentioned-user-ids' => array_values( array_map( 'intval', $recipientIds ) ),
				],
			] );
			return true;
		} catch ( \Throwable $e ) {
			LoggerFactory::getInstance( 'CollabPatrol' )->warning(
				'Could not create Echo mention event: {message}',
				[ 'message' => $e->getMessage() ]
			);
			return false;
		}
	}
}
