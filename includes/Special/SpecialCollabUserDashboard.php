<?php

namespace MediaWiki\Extension\CollabPatrol\Special;

use MediaWiki\Html\Html;
use MediaWiki\Permissions\PermissionManager;
use MediaWiki\SpecialPage\SpecialPage;

class SpecialCollabUserDashboard extends SpecialPage {

	private PermissionManager $permissionManager;

	public function __construct( PermissionManager $permissionManager ) {
		parent::__construct( 'CollabUserDashboard', 'collabpatrol-use' );
		$this->permissionManager = $permissionManager;
	}

	public function execute( $subPage ): void {
		$this->setHeaders();
		$this->checkPermissions();

		$out = $this->getOutput();
		$out->setPageTitle( $this->msg( 'collabpatrol-user-dashboard-title' )->text() );
		$out->addModules( [ 'ext.collabPatrol', 'ext.collabPatrol.special' ] );

		$user = $this->getUser();
		$isAdmin = $this->permissionManager->userHasRight( $user, 'collabpatrol-admin' );

		$mainDashboardLink = $this->getLinkRenderer()->makeLink(
			SpecialPage::getTitleFor( 'CollabPatrol' ),
			$this->msg( 'collabpatrol-dashboard-title' )->text()
		);

		$out->addHTML( Html::rawElement(
			'div',
			[ 'class' => 'collabpatrol-user-dash-links' ],
			$mainDashboardLink
		) );

		$out->addHTML( Html::element( 'div', [
			'id' => 'collabpatrol-user-dashboard',
			'data-is-admin' => $isAdmin ? '1' : '0',
			'data-username' => $user->getName(),
		], '' ) );
	}

	protected function getGroupName(): string {
		return 'wiki';
	}
}
