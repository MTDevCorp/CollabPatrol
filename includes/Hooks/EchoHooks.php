<?php

namespace MediaWiki\Extension\CollabPatrol\Hooks;

class EchoHooks {

	public static function onEchoGetDefaultNotifiedUsers( $event, array &$users ): void {
		if ( !$event || $event->getType() !== 'collabpatrol-chat-mention' ) {
			return;
		}
		$extra = $event->getExtra();
		$recipientIds = $extra['collabpatrol-recipients'] ?? [];
		if ( !is_array( $recipientIds ) || !$recipientIds ) {
			return;
		}
		$services = \MediaWiki\MediaWikiServices::getInstance();
		$userFactory = $services->getUserFactory();
		foreach ( $recipientIds as $recipientId ) {
			$recipientId = (int)$recipientId;
			if ( $recipientId <= 0 ) {
				continue;
			}
			$targetUser = $userFactory->newFromId( $recipientId );
			if ( !$targetUser || !$targetUser->isRegistered() ) {
				continue;
			}
			$users[$targetUser->getId()] = $targetUser;
		}
	}
}
