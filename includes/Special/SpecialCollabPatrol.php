<?php

namespace MediaWiki\Extension\CollabPatrol\Special;

use HTMLForm;
use MediaWiki\Extension\CollabPatrol\CollabPatrolStore;
use MediaWiki\Html\Html;
use MediaWiki\Permissions\PermissionManager;
use MediaWiki\Revision\RevisionStore;
use MediaWiki\SpecialPage\SpecialPage;
use MediaWiki\User\UserFactory;
use Wikimedia\Rdbms\ILoadBalancer;

class SpecialCollabPatrol extends SpecialPage {

	private CollabPatrolStore $store;
	private RevisionStore $revisionStore;
	private UserFactory $userFactory;
	private PermissionManager $permissionManager;

	public function __construct(
		ILoadBalancer $lb,
		UserFactory $userFactory,
		RevisionStore $revisionStore,
		PermissionManager $permissionManager
	) {
		parent::__construct( 'CollabPatrol', 'collabpatrol-use' );
		$config = $this->getConfig();
		$this->store = new CollabPatrolStore( $lb, $config );
		$this->revisionStore = $revisionStore;
		$this->userFactory = $userFactory;
		$this->permissionManager = $permissionManager;
	}

	public function execute( $subPage ): void {
		$this->setHeaders();
		$this->checkPermissions();
		$out = $this->getOutput();

		$out->addModules( [ 'ext.collabPatrol', 'ext.collabPatrol.special' ] );

		if ( $subPage === 'stats' ) {
			$this->renderStats( $out );
		} else {
			$this->renderDashboard( $out );
		}
	}

	private function renderDashboard( $out ): void {
		$out->setPageTitle( $this->msg( 'collabpatrol-dashboard-title' )->text() );

		$user = $this->getUser();
		$isAdmin = $this->permissionManager->userHasRight( $user, 'collabpatrol-admin' );

		$out->addHTML( Html::element( 'div', [ 'id' => 'collabpatrol-dashboard',
			'data-is-admin' => $isAdmin ? '1' : '0',
			'data-username' => $user->getName(),
		], '' ) );

		$config = $this->getConfig();
		$urgencyThreshold = $config->get( 'CollabPatrolUrgencyThreshold' );
		$out->addJsConfigVars( [
			'wgCollabPatrolUrgencyThreshold' => $urgencyThreshold,
			'wgCollabPatrolIsAdmin' => $isAdmin,
		] );

		$statsLink = $this->getLinkRenderer()->makeLink(
			$this->getPageTitle( 'stats' ),
			$this->msg( 'collabpatrol-stats-title' )->text()
		);
		$out->addHTML( Html::rawElement( 'p', [ 'class' => 'collabpatrol-stats-link' ], $statsLink ) );
	}

	private function renderStats( $out ): void {
		$out->setPageTitle( $this->msg( 'collabpatrol-stats-title' )->text() );
		$stats = $this->store->getStats();

		$out->addHTML( Html::openElement( 'div', [ 'class' => 'collabpatrol-stats' ] ) );
		$out->addHTML( Html::element( 'h2', [], $this->msg( 'collabpatrol-stats-title' )->text() ) );

		$out->addHTML( Html::openElement( 'table', [ 'class' => 'wikitable' ] ) );
		$out->addHTML( Html::rawElement( 'tr', [],
			Html::element( 'th', [], $this->msg( 'collabpatrol-stats-total' )->text() ) .
			Html::element( 'td', [], (string)$stats['totalHistory'] )
		) );
		$out->addHTML( Html::rawElement( 'tr', [],
			Html::element( 'th', [], $this->msg( 'collabpatrol-stats-pending' )->text() ) .
			Html::element( 'td', [], (string)$stats['pending'] )
		) );
		$out->addHTML( Html::rawElement( 'tr', [],
			Html::element( 'th', [], $this->msg( 'collabpatrol-stats-progress' )->text() ) .
			Html::element( 'td', [], (string)$stats['in_progress'] )
		) );
		$out->addHTML( Html::rawElement( 'tr', [],
			Html::element( 'th', [], $this->msg( 'collabpatrol-stats-finished' )->text() ) .
			Html::element( 'td', [], (string)$stats['finished'] )
		) );
		$out->addHTML( Html::closeElement( 'table' ) );

		if ( $stats['topPatrollers'] ) {
			$out->addHTML( Html::element( 'h3', [], $this->msg( 'collabpatrol-stats-top-patrollers' )->text() ) );
			$out->addHTML( Html::openElement( 'ol' ) );
			foreach ( $stats['topPatrollers'] as $entry ) {
				$userLink = $this->getLinkRenderer()->makeLink(
					\Title::makeTitle( NS_USER, $entry['user'] ),
					$entry['user']
				);
				$out->addHTML( Html::rawElement( 'li', [],
					$userLink . ' — ' . (string)$entry['count']
				) );
			}
			$out->addHTML( Html::closeElement( 'ol' ) );
		}

		$out->addHTML( Html::closeElement( 'div' ) );
	}

	protected function getGroupName(): string {
		return 'wiki';
	}
}
