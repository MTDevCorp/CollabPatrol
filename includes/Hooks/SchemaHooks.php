<?php

namespace MediaWiki\Extension\CollabPatrol\Hooks;

use DatabaseUpdater;

class SchemaHooks {

	public static function onLoadExtensionSchemaUpdates( DatabaseUpdater $updater ): void {
		$sqlDir = dirname( __DIR__, 2 ) . '/sql';
		$updater->addExtensionTable( 'collab_patrol', "$sqlDir/collab_patrol.sql" );
		$updater->addExtensionTable( 'collab_patrol_history', "$sqlDir/collab_patrol_history.sql" );
		$updater->addExtensionTable( 'collab_patrol_chat', "$sqlDir/collab_patrol_chat.sql" );
		$updater->addExtensionTable( 'collab_patrol_chat_ban', "$sqlDir/collab_patrol_chat_ban.sql" );
	}
}
