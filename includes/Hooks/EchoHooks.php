<?php

namespace MediaWiki\Extension\CollabPatrol\Hooks;

use MediaWiki\Extension\CollabPatrol\Notifications\MentionNotifier;
use MediaWiki\Extension\CollabPatrol\Notifications\MentionPresentationModel;
use MediaWiki\MediaWikiServices;

/**
 * Echo integration. These hooks are only called when the Echo extension is loaded.
 */
class EchoHooks {

	public static function onBeforeCreateEchoEvent(
		array &$notifications,
		array &$notificationCategories,
		array &$icons
	): void {
		$notificationCategories[MentionNotifier::EVENT_TYPE] = [
			'priority' => 3,
			'tooltip' => 'echo-pref-tooltip-collabpatrol-mention',
		];

		$notifications[MentionNotifier::EVENT_TYPE] = [
			'category' => MentionNotifier::EVENT_TYPE,
			'group' => 'interactive',
			'section' => 'alert',
			'presentation-model' => MentionPresentationModel::class,
			'user-locators' => [ [ self::class . '::locateMentionedUsers' ] ],
			'icon' => 'mention',
		];
	}

	/**
	 * Echo user locator: returns the users listed in the event's "mentioned-user-ids".
	 *
	 * @param \MediaWiki\Extension\Notifications\Model\Event $event
	 * @return \MediaWiki\User\User[] Keyed by user ID
	 */
	public static function locateMentionedUsers( $event ): array {
		$ids = $event->getExtraParam( 'mentioned-user-ids', [] );
		if ( !is_array( $ids ) ) {
			return [];
		}
		$userFactory = MediaWikiServices::getInstance()->getUserFactory();
		$users = [];
		foreach ( $ids as $id ) {
			$id = (int)$id;
			if ( $id > 0 ) {
				$users[$id] = $userFactory->newFromId( $id );
			}
		}
		return $users;
	}
}
