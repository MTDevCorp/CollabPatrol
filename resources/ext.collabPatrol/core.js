/**
 * CollabPatrol — noyau léger (aucune dépendance OOUI JS).
 * Configuration, helpers de temps/statut et utilitaires partagés.
 */
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

	function parseButtonMode() {
		var value = String( getUserOption( 'collabpatrol-minerva-button-mode', 'normal' ) );
		return [ 'compact', 'normal', 'full' ].indexOf( value ) === -1 ? 'normal' : value;
	}

	CP.config = {
		urgencyThreshold: ( mw.config.get( 'wgCollabPatrolUrgencyThreshold' ) || 3600 ) * 1000,
		isAdmin: !!mw.config.get( 'wgCollabPatrolIsAdmin' ),
		autoPatrol: !!mw.config.get( 'wgCollabPatrolAutoPatrol' ),
		chatEnabled: !!mw.config.get( 'wgCollabPatrolChatEnabled' ),
		chatMaxLength: mw.config.get( 'wgCollabPatrolChatMaxLength' ) || 500,
		refreshInterval: parseRefreshInterval(),
		notifyFinished: !!parseInt( getUserOption( 'collabpatrol-notify-finished', 1 ), 10 ),
		showHistory: !!parseInt( getUserOption( 'collabpatrol-show-history', 1 ), 10 ),
		// Minerva : compact (icônes seules) | normal | full (libellés partout)
		minervaButtonMode: parseButtonMode()
	};

	CP.userName = mw.config.get( 'wgUserName' );

	/** Minerva (mobile) : interface compacte. */
	CP.isMobile = mw.config.get( 'skin' ) === 'minerva';

	/**
	 * Un bouton s'affiche-t-il en icône seule ? (Minerva uniquement ; ailleurs : jamais)
	 *
	 * Modes : compact = icônes seules ; normal = libellé sur les boutons
	 * principaux (signaler / prendre / terminer) ; full = libellé partout.
	 * Annuler n'a jamais de libellé sur Minerva ; le bouton drapeau
	 * (« Mettre en attente ») a toujours son libellé, quel que soit le mode.
	 *
	 * @param {string} kind main | flag | chat | cancel
	 * @return {boolean}
	 */
	CP.btnIconOnly = function ( kind ) {
		if ( !CP.isMobile ) {
			return false;
		}
		if ( kind === 'flag' ) {
			return false;
		}
		if ( kind === 'cancel' ) {
			return true;
		}
		switch ( CP.config.minervaButtonMode ) {
			case 'compact':
				return true;
			case 'full':
				return false;
			default:
				return kind !== 'main';
		}
	};

	/** Au moins un bouton a-t-il un libellé ? */
	CP.hasButtonLabels = function () {
		return !CP.isMobile || CP.config.minervaButtonMode !== 'compact';
	};

	CP.now = function () {
		return Date.now();
	};

	CP.formatTimeElapsed = function ( ms ) {
		var minutes = Math.floor( ms / 60000 );
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

	/**
	 * Libellé d'un statut ou d'une action d'historique.
	 *
	 * @param {string} status pending | in_progress | finished | removed
	 * @return {string}
	 */
	CP.getStatusLabel = function ( status ) {
		switch ( status ) {
			case 'pending':
				return mw.msg( 'collabpatrol-status-pending' );
			case 'in_progress':
				return mw.msg( 'collabpatrol-status-in-progress' );
			case 'removed':
				return mw.msg( 'collabpatrol-status-removed' );
			default:
				return mw.msg( 'collabpatrol-status-finished' );
		}
	};

	/**
	 * Icône OOUI et classe de couleur d'un statut / d'une action.
	 *
	 * @param {string} status
	 * @param {boolean} [urgent]
	 * @return {{icon: string, cls: string}}
	 */
	CP.getStatusMeta = function ( status, urgent ) {
		switch ( status ) {
			case 'pending':
				return urgent ?
					{ icon: 'alert', cls: 'urgent' } :
					{ icon: 'clock', cls: 'pending' };
			case 'in_progress':
				return { icon: 'eye', cls: 'progress' };
			case 'removed':
				return { icon: 'close', cls: 'removed' };
			default:
				return { icon: 'check', cls: 'finished' };
		}
	};

	CP.getRevId = function () {
		return mw.config.get( 'wgDiffNewId' ) || mw.config.get( 'wgRevisionId' ) || null;
	};

	CP.isUnpatrolled = function () {
		return document.querySelector( '.patrollink' ) !== null;
	};

	/** Un onglet masqué ne doit pas interroger le serveur. */
	CP.isVisible = function () {
		return !document.hidden;
	};

	/**
	 * Exécute fn à intervalle régulier, uniquement quand l'onglet est visible,
	 * et immédiatement quand il redevient visible.
	 *
	 * @param {Function} fn
	 * @param {number} interval ms (0 = désactivé)
	 * @return {Function} stop
	 */
	CP.poll = function ( fn, interval ) {
		var timer = null;
		function tick() {
			if ( CP.isVisible() ) {
				fn();
			}
		}
		function onVisible() {
			if ( CP.isVisible() ) {
				fn();
			}
		}
		if ( interval > 0 ) {
			timer = setInterval( tick, interval );
			document.addEventListener( 'visibilitychange', onVisible );
		}
		return function () {
			clearInterval( timer );
			document.removeEventListener( 'visibilitychange', onVisible );
		};
	};

}() );

