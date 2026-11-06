<?php

namespace MediaWiki\Extension\CollabPatrol\Jobs;

use Job;
use MediaWiki\Extension\CollabPatrol\CollabPatrolStore;
use Title;

class CollabPatrolExpireJob extends Job {

	public function __construct( Title $title, array $params ) {
		parent::__construct( 'CollabPatrolExpireJob', $title, $params );
		$this->removeDuplicates = true;
	}

	public function run(): bool {
		$services = \MediaWiki\MediaWikiServices::getInstance();
		$store = new CollabPatrolStore(
			$services->getDBLoadBalancer(),
			$services->getMainConfig()
		);
		$store->purgeExpired();
		return true;
	}
}
