<?php

namespace MediaWiki\Extension\CollabPatrol\Hooks;

use DifferenceEngine;
use MediaWiki\Extension\CollabPatrol\CollabPatrolStore;
use MediaWiki\Output\OutputPage;
use Skin;

class PageHooks {

	public static function onBeforePageDisplay( OutputPage $out, Skin $skin ): void {
		$user = $out->getUser();
		if ( !$user->isAllowed( 'collabpatrol-use' ) ) {
			return;
		}

		$request = $out->getRequest();
		$isDiff = $request->getVal( 'diff' ) || $request->getVal( 'oldid' );
		$title = $out->getTitle();
		$isRC = $title
			&& $title->getNamespace() === NS_SPECIAL
			&& in_array( $title->getDBkey(), [ 'Recentchanges', 'Watchlist' ], true );

		if ( !$isDiff && !$isRC ) {
			return;
		}

		// RC / watchlist only need the tiny dots+counter module; diffs need the interface.
		// The heavy OOUI parts (chat popup, prompts) are loaded on demand by the JS.
		self::addAssets( $out, $isDiff ? 'ext.collabPatrol.ui' : 'ext.collabPatrol.rc' );
	}

	public static function onDifferenceEngineViewHeader( DifferenceEngine $diff ): void {
		$out = $diff->getOutput();
		if ( !$out->getUser()->isAllowed( 'collabpatrol-use' ) ) {
			return;
		}

		self::addAssets( $out, 'ext.collabPatrol.ui' );

		// Performance: hand the entry to the page so that the interface can be drawn
		// immediately, without a first API round trip.
		$revId = (int)$diff->getNewid();
		if ( $revId > 0 ) {
			$out->addJsConfigVars( 'wgCollabPatrolInitial', [
				'revId' => $revId,
				'entry' => CollabPatrolStore::newFromServices()->getEntryFull( $revId ),
			] );
		}
	}

	private static function addAssets( OutputPage $out, string $module ): void {
		$config = $out->getConfig();
		if ( $module === 'ext.collabPatrol.rc' ) {
			// Dot styles in <head>: no flash, the dots are rendered server-side.
			$out->addModuleStyles( [ 'ext.collabPatrol.rc.styles' ] );
		}
		$out->addModules( [ $module ] );
		$out->addJsConfigVars( [
			'wgCollabPatrolUrgencyThreshold' => $config->get( 'CollabPatrolUrgencyThreshold' ),
			'wgCollabPatrolIsAdmin' => $out->getUser()->isAllowed( 'collabpatrol-admin' ),
			'wgCollabPatrolAutoPatrol' => $config->get( 'CollabPatrolAutoPatrol' ),
			'wgCollabPatrolChatEnabled' => $config->get( 'CollabPatrolChatEnabled' ),
			'wgCollabPatrolChatMaxLength' => $config->get( 'CollabPatrolChatMaxLength' ),
		] );
	}
}
