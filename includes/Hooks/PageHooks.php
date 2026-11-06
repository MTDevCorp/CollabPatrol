<?php

namespace MediaWiki\Extension\CollabPatrol\Hooks;

use DifferenceEngine;
use MediaWiki\Output\OutputPage;
use Skin;

class PageHooks {

	public static function onBeforePageDisplay( OutputPage $out, Skin $skin ): void {
		$user = $out->getUser();
		if ( !$user->isAllowed( 'collabpatrol-use' ) ) {
			return;
		}

		$config = $out->getConfig();
		$skinName = $skin->getSkinName();

		$request = $out->getRequest();
		$isDiff = $request->getVal( 'diff' ) || $request->getVal( 'oldid' );
		$isRC = in_array( $out->getTitle()->getDBkey(), [ 'Recentchanges', 'Watchlist' ], true )
			&& $out->getTitle()->getNamespace() === NS_SPECIAL;

		if ( !$isDiff && !$isRC ) {
			return;
		}

		if ( $skinName === 'minerva' ) {
			$out->addModules( [ 'ext.collabPatrol', 'ext.collabPatrol.minerva' ] );
		} else {
			$modules = [ 'ext.collabPatrol' ];
			if ( $isDiff && $config->get( 'CollabPatrolChatEnabled' ) ) {
				$modules[] = 'ext.collabPatrol.chat';
			}
			$out->addModules( $modules );
		}

		$out->addJsConfigVars( [
			'wgCollabPatrolUrgencyThreshold' => $config->get( 'CollabPatrolUrgencyThreshold' ),
			'wgCollabPatrolIsAdmin'          => $user->isAllowed( 'collabpatrol-admin' ),
			'wgCollabPatrolAutoPatrol'        => $config->get( 'CollabPatrolAutoPatrol' ),
			'wgCollabPatrolChatEnabled'       => $config->get( 'CollabPatrolChatEnabled' ),
			'wgCollabPatrolChatMaxLength'     => $config->get( 'CollabPatrolChatMaxLength' ),
		] );
	}

	public static function onDifferenceEngineViewHeader( DifferenceEngine $diff ): void {
		$out = $diff->getOutput();
		$user = $out->getUser();

		if ( !$user->isAllowed( 'collabpatrol-use' ) ) {
			return;
		}

		$config = $out->getConfig();
		$skin = $out->getSkin()->getSkinName();

		if ( $skin === 'minerva' ) {
			$out->addModules( [ 'ext.collabPatrol', 'ext.collabPatrol.minerva' ] );
		} else {
			$modules = [ 'ext.collabPatrol' ];
			if ( $config->get( 'CollabPatrolChatEnabled' ) ) {
				$modules[] = 'ext.collabPatrol.chat';
			}
			$out->addModules( $modules );
		}

		$out->addJsConfigVars( [
			'wgCollabPatrolUrgencyThreshold' => $config->get( 'CollabPatrolUrgencyThreshold' ),
			'wgCollabPatrolIsAdmin'          => $user->isAllowed( 'collabpatrol-admin' ),
			'wgCollabPatrolAutoPatrol'        => $config->get( 'CollabPatrolAutoPatrol' ),
			'wgCollabPatrolChatEnabled'       => $config->get( 'CollabPatrolChatEnabled' ),
			'wgCollabPatrolChatMaxLength'     => $config->get( 'CollabPatrolChatMaxLength' ),
		] );
	}
}
