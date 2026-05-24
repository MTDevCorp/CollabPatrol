<?php

namespace MediaWiki\Extension\CollabPatrol\Echo;

use EchoEventPresentationModel;

class CollabPatrolChatMentionPresentationModel extends EchoEventPresentationModel {

	public function getIconType() {
		return 'mention';
	}

	public function getHeaderMessage() {
		$msg = $this->getMessageWithAgent( 'notification-collabpatrol-chat-mention' );
		$msg->params( $this->getTruncatedTitleText( $this->event->getTitle(), true ) );
		return $msg;
	}

	public function getBodyMessage() {
		$text = (string)( $this->event->getExtra()['collabpatrol-message'] ?? '' );
		$msg = $this->msg( 'notification-body-collabpatrol-chat-mention' );
		$msg->params( $text );
		return $msg;
	}

	public function getPrimaryLink() {
		$title = $this->event->getTitle();
		if ( !$title ) {
			return false;
		}
		$revid = (int)( $this->event->getExtra()['collabpatrol-revid'] ?? 0 );
		$url = $revid > 0
			? $title->getLocalURL( [ 'diff' => $revid ] )
			: $title->getLocalURL();
		return [
			'url' => $url,
			'label' => $this->msg( 'notification-link-text-collabpatrol-chat-mention' )->text(),
		];
	}

	public function getSecondaryLinks() {
		return [ $this->getAgentLink() ];
	}
}
