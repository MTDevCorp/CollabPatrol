<?php

namespace MediaWiki\Extension\CollabPatrol\Hooks;

use ChangesList;
use MediaWiki\Extension\CollabPatrol\CollabPatrolStore;
use MediaWiki\Html\Html;
use RecentChange;

class RCHooks {

	/** @var array<int,array|false> Entries by revision ID (false = no entry) */
	private static array $entries = [];

	/** @var bool Whether ChangesListInitRows has run (batch preload available) */
	private static bool $preloaded = false;

	/**
	 * Performance: one single query for every row of the list instead of one
	 * query per line.
	 *
	 * @param ChangesList $changesList
	 * @param iterable $rows
	 */
	public static function onChangesListInitRows( ChangesList $changesList, $rows ): void {
		if ( !$changesList->getUser()->isAllowed( 'collabpatrol-use' ) ) {
			return;
		}

		$revIds = [];
		foreach ( $rows as $row ) {
			$id = (int)( $row->rc_this_oldid ?? 0 );
			if ( $id > 0 ) {
				$revIds[$id] = true;
			}
		}
		if ( !$revIds ) {
			return;
		}

		$found = CollabPatrolStore::newFromServices()->getEntriesForRevisions( array_keys( $revIds ) );
		foreach ( $revIds as $id => $_ ) {
			self::$entries[$id] = $found[$id] ?? false;
		}
		self::$preloaded = true;
	}

	public static function onChangesListInsertArticleLink(
		ChangesList $changesList,
		string &$articlelink,
		string &$s,
		RecentChange $rc,
		bool $unpatrolled,
		bool $watched
	): void {
		$revId = (int)$rc->getAttribute( 'rc_this_oldid' );
		if ( !$revId || !$changesList->getUser()->isAllowed( 'collabpatrol-use' ) ) {
			return;
		}

		if ( array_key_exists( $revId, self::$entries ) ) {
			$entry = self::$entries[$revId];
		} elseif ( self::$preloaded ) {
			return;
		} else {
			// Fallback when the batch preload hook is not available.
			$entry = CollabPatrolStore::newFromServices()->getEntry( $revId ) ?? false;
		}
		if ( !$entry ) {
			return;
		}

		if ( $entry['status'] === 'pending' ) {
			$class = 'pending';
			$label = wfMessage( 'collabpatrol-status-pending' )->text();
		} elseif ( $entry['status'] === 'in_progress' ) {
			$class = 'progress';
			$label = wfMessage( 'collabpatrol-status-in-progress' )->text();
		} else {
			return;
		}
		if ( $entry['comment'] !== '' ) {
			$label .= ' : ' . $entry['comment'];
		}

		$dot = Html::element( 'span', [
			'class' => "collabpatrol-rc-dot collabpatrol-rc-dot-$class",
			'title' => $label,
			'role' => 'img',
			'aria-label' => $label,
		] );
		$articlelink = $dot . ' ' . $articlelink;
	}
}
