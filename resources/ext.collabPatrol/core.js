( function () {
	'use strict';

	window.CollabPatrol = window.CollabPatrol || {};

	var CP = window.CollabPatrol;
	var userOptions = mw.user && mw.user.options ? mw.user.options : null;

	function getUserOption( key, fallback ) {
		if ( !userOptions || typeof userOptions.get !== 'function' ) {
			return fallback;
		}
		var value = userOptions.get( key );
		return value === undefined || value === null ? fallback : value;
	}

	function parseRefreshInterval() {
		var value = parseInt( getUserOption( 'collabpatrol-refresh-interval', 30 ), 10 );
		if ( [ 0, 10, 20, 30, 60 ].indexOf( value ) === -1 ) {
			value = 30;
		}
		return value * 1000;
	}

	CP.config = {
		urgencyThreshold: ( mw.config.get( 'wgCollabPatrolUrgencyThreshold' ) || 3600 ) * 1000,
		isAdmin: !!mw.config.get( 'wgCollabPatrolIsAdmin' ),
		autoPatrol: !!mw.config.get( 'wgCollabPatrolAutoPatrol' ),
		refreshInterval: parseRefreshInterval(),
		notifyFinished: !!parseInt( getUserOption( 'collabpatrol-notify-finished', 1 ), 10 ),
		chatOpenDefault: !!parseInt( getUserOption( 'collabpatrol-chat-open-default', 0 ), 10 ),
		showHistory: !!parseInt( getUserOption( 'collabpatrol-show-history', 1 ), 10 ),
		compactMode: !!parseInt( getUserOption( 'collabpatrol-compact-mode', 0 ), 10 ),
		commentTemplates: [
			mw.msg( 'collabpatrol-template-verify' ),
			mw.msg( 'collabpatrol-template-doubt' ),
			mw.msg( 'collabpatrol-template-second-opinion' ),
			mw.msg( 'collabpatrol-template-complex' ),
			mw.msg( 'collabpatrol-template-vandalism' ),
			mw.msg( 'collabpatrol-template-sourcing' ),
			mw.msg( 'collabpatrol-template-major' ),
			mw.msg( 'collabpatrol-template-sensitive' ),
			mw.msg( 'collabpatrol-template-conflict' ),
			mw.msg( 'collabpatrol-template-other' )
		]
	};

	CP.userName = mw.config.get( 'wgUserName' );

	CP.now = function () {
		return Date.now();
	};

	CP.formatTimeElapsed = function ( ms ) {
		var seconds = Math.floor( ms / 1000 );
		var minutes = Math.floor( seconds / 60 );
		var hours = Math.floor( minutes / 60 );
		var days = Math.floor( hours / 24 );

		if ( days > 0 ) {
			return mw.msg( 'collabpatrol-time-days', days );
		}
		if ( hours > 0 ) {
			return mw.msg( 'collabpatrol-time-hours', hours );
		}
		if ( minutes > 0 ) {
			return mw.msg( 'collabpatrol-time-minutes', minutes );
		}
		return mw.msg( 'collabpatrol-time-now' );
	};

	CP.getStatusLabel = function ( status ) {
		if ( status === 'pending' ) {
			return mw.msg( 'collabpatrol-status-pending' );
		}
		if ( status === 'in_progress' ) {
			return mw.msg( 'collabpatrol-status-in-progress' );
		}
		return mw.msg( 'collabpatrol-status-finished' );
	};

	CP.getRevId = function () {
		return mw.config.get( 'wgDiffNewId' ) || mw.config.get( 'wgRevisionId' ) || null;
	};

	CP.isUnpatrolled = function () {
		return $( '.patrollink' ).length > 0;
	};

}() );
