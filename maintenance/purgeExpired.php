<?php

use MediaWiki\Extension\CollabPatrol\CollabPatrolStore;
use MediaWiki\Maintenance\Maintenance;

require_once getenv( 'MW_INSTALL_PATH' ) !== false
	? getenv( 'MW_INSTALL_PATH' ) . '/maintenance/Maintenance.php'
	: __DIR__ . '/../../../maintenance/Maintenance.php';

class PurgeExpiredCollabPatrol extends Maintenance {

	public function __construct() {
		parent::__construct();
		$this->addDescription( 'Purge expired CollabPatrol entries from the database' );
		$this->requireExtension( 'CollabPatrol' );
	}

	public function execute(): void {
		$services = $this->getServiceContainer();
		$store = new CollabPatrolStore(
			$services->getDBLoadBalancer(),
			$services->getMainConfig()
		);
		$count = $store->purgeExpired();
		$this->output( "Purged $count expired entries.\n" );
	}
}

$maintClass = PurgeExpiredCollabPatrol::class;
require_once RUN_MAINTENANCE_IF_MAIN;
