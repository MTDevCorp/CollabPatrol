<?php

namespace MediaWiki\Extension\CollabPatrol\Hooks;

use MediaWiki\SpecialPage\SpecialPage;
use Skin;

class SkinHooks {

	public static function onSkinTemplateNavigationUniversal( Skin $skin, array &$links ): void {
		$user = $skin->getUser();
		if ( !$user->isAllowed( 'collabpatrol-use' ) ) {
			return;
		}

		$title = $skin->getTitle();
		$canonicalName = $title->isSpecialPage()
			? \MediaWiki\MediaWikiServices::getInstance()
				->getSpecialPageFactory()
				->resolveAlias( $title->getDBkey() )[0]
			: null;

		if ( $canonicalName !== 'Recentchanges' && $canonicalName !== 'Watchlist' ) {
			return;
		}

		$dashUrl = SpecialPage::getTitleFor( 'CollabPatrol' )->getLocalURL();
		$links['actions']['collabpatrol-dashboard'] = [
			'text' => wfMessage( 'collabpatrol-dashboard-title' )->text(),
			'href' => $dashUrl,
			'class' => 'collabpatrol-nav-link',
		];
	}
}
