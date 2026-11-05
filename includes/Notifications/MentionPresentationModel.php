<?php

namespace MediaWiki\Extension\CollabPatrol\Notifications;

use MediaWiki\Extension\Notifications\Formatters\EchoEventPresentationModel;

class MentionPresentationModel extends EchoEventPresentationModel {

	/** @inheritDoc */
	public function canRender() {
		return (bool)$this->event->getTitle();
	}

	/** @inheritDoc */
	public function getIconType() {
		return 'mention';
	}

	/** @inheritDoc */
	public function getHeaderMessage() {
		$msg = $this->msg( 'notification-header-collabpatrol-mention' );
		$msg->params(
			$this->getAgentForOutput(),
			$this->getTruncatedTitleText( $this->event->getTitle(), true ),
			$this->getViewingUserForGender()
		);
		return $msg;
	}

	/** @inheritDoc */
	public function getBodyMessage() {
		$excerpt = $this->event->getExtraParam( 'excerpt' );
		if ( !is_string( $excerpt ) || $excerpt === '' ) {
			return false;
		}
		$msg = new \RawMessage( '$1' );
		$msg->plaintextParams( $excerpt );
		return $msg;
	}

	/** @inheritDoc */
	public function getPrimaryLink() {
		$title = $this->event->getTitle();
		$revId = (int)$this->event->getExtraParam( 'cp-revid', 0 );
		if ( !$title || !$revId ) {
			return false;
		}
		return [
			'url' => $title->getFullURL( [ 'diff' => $revId ] ) . '#cp-chat',
			'label' => $this->msg( 'collabpatrol-echo-link-discussion' )->text(),
		];
	}

	/** @inheritDoc */
	public function getSecondaryLinks() {
		$agentLink = $this->getAgentLink();
		return $agentLink ? [ $agentLink ] : [];
	}
}
