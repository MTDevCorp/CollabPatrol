<?php

namespace MediaWiki\Extension\CollabPatrol\Hooks;

use ChangesList;
use MediaWiki\Extension\CollabPatrol\CollabPatrolStore;
use RecentChange;
use Wikimedia\Rdbms\ILoadBalancer;

class RCHooks {

	private static ?CollabPatrolStore $store = null;

	private static function getStore(): CollabPatrolStore {
		if ( self::$store === null ) {
			$services = \MediaWiki\MediaWikiServices::getInstance();
			self::$store = new CollabPatrolStore(
				$services->getDBLoadBalancer(),
				$services->getMainConfig()
			);
		}
		return self::$store;
	}

	public static function onChangesListInsertArticleLink(
		ChangesList $changesList,
		string &$articlelink,
		string &$s,
		RecentChange $rc,
		bool $unpatrolled,
		bool $watched
	): void {
		$revId = $rc->getAttribute( 'rc_this_oldid' );
		if ( !$revId ) {
			return;
		}

		$user = $changesList->getUser();
		if ( !$user->isAllowed( 'collabpatrol-use' ) ) {
			return;
		}

		$entry = self::getStore()->getEntry( (int)$revId );
		if ( !$entry ) {
			return;
		}

		$status = $entry['status'];
		$dot = '';

		if ( $status === 'pending' ) {
			$dot = \Html::element( 'span', [
				'class' => 'collabpatrol-rc-dot collabpatrol-rc-dot-pending',
				'title' => wfMessage( 'collabpatrol-status-pending' )->text() . ( $entry['comment'] ? ': ' . $entry['comment'] : '' ),
			], '●' );
		} elseif ( $status === 'in_progress' ) {
			$dot = \Html::element( 'span', [
				'class' => 'collabpatrol-rc-dot collabpatrol-rc-dot-progress',
				'title' => wfMessage( 'collabpatrol-status-in-progress' )->text(),
			], '●' );
		}

		if ( $dot ) {
			$articlelink = $dot . ' ' . $articlelink;
		}
	}
}
