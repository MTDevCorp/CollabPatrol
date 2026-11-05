<?php

namespace MediaWiki\Extension\CollabPatrol\Hooks;

use MediaWiki\User\User;

class PreferencesHooks {

	public static function onGetPreferences( User $user, array &$preferences ): void {
		$preferences['collabpatrol-refresh-interval'] = [
			'type' => 'select',
			'label-message' => 'collabpatrol-pref-refresh-interval',
			'section' => 'rendering/collabpatrol',
			'options' => [
				wfMessage( 'collabpatrol-pref-refresh-manual' )->text() => '0',
				wfMessage( 'collabpatrol-pref-refresh-10' )->text() => '10',
				wfMessage( 'collabpatrol-pref-refresh-20' )->text() => '20',
				wfMessage( 'collabpatrol-pref-refresh-30' )->text() => '30',
				wfMessage( 'collabpatrol-pref-refresh-60' )->text() => '60',
			],
		];

		$preferences['collabpatrol-notify-finished'] = [
			'type' => 'toggle',
			'label-message' => 'collabpatrol-pref-notify-finished',
			'section' => 'rendering/collabpatrol',
		];

		$preferences['collabpatrol-chat-open-default'] = [
			'type' => 'toggle',
			'label-message' => 'collabpatrol-pref-chat-open-default',
			'section' => 'rendering/collabpatrol',
		];

		$preferences['collabpatrol-show-history'] = [
			'type' => 'toggle',
			'label-message' => 'collabpatrol-pref-show-history',
			'section' => 'rendering/collabpatrol',
		];

		$preferences['collabpatrol-compact-mode'] = [
			'type' => 'toggle',
			'label-message' => 'collabpatrol-pref-compact-mode',
			'section' => 'rendering/collabpatrol',
		];
	}
}
