<?php

namespace MediaWiki\Extension\CollabPatrol\Hooks;

use DatabaseUpdater;

class SchemaHooks {

	public static function onLoadExtensionSchemaUpdates( DatabaseUpdater $updater ): void {
		$sqlDir = dirname( __DIR__, 2 ) . '/sql';
		$updater->addExtensionTable( 'collab_patrol', "$sqlDir/collab_patrol.sql" );
		$updater->addExtensionTable( 'collab_patrol_history', "$sqlDir/collab_patrol_history.sql" );
		$updater->addExtensionTable( 'collab_patrol_chat', "$sqlDir/collab_patrol_chat.sql" );

		// Performance: indexes matching the dashboard / statistics / chat queries.
		$updater->addExtensionIndex( 'collab_patrol', 'cp_status_timestamp', "$sqlDir/patch-cp-status-timestamp.sql" );
		$updater->addExtensionIndex( 'collab_patrol', 'cp_timestamp', "$sqlDir/patch-cp-timestamp.sql" );
		$updater->addExtensionIndex( 'collab_patrol_history', 'cph_action_user', "$sqlDir/patch-cph-action-user.sql" );
		$updater->addExtensionIndex( 'collab_patrol_chat', 'cpc_rev_id_id', "$sqlDir/patch-cpc-rev-id-id.sql" );

		// Finished entries are now deleted when the review ends: clean the old ones.
		$updater->addExtensionUpdate( [ 'applyPatch', "$sqlDir/patch-purge-finished.sql", true ] );

		// The chat ban system has been removed.
		$updater->dropExtensionTable( 'collab_patrol_chat_ban', "$sqlDir/patch-drop-chat-ban.sql" );
	}
}
