/**
 * CollabPatrol — client de l'API (formatversion 2 : vrais booléens).
 */
( function () {
	'use strict';

	var CP = window.CollabPatrol;
	var api = new mw.Api( { parameters: { action: 'collabpatrol', formatversion: 2 } } );

	function result( data ) {
		return ( data && data.collabpatrol ) || {};
	}

	CP.api = {

		/**
		 * Notifie une erreur d'API. Un utilisateur bloqué sur le wiki voit un
		 * message dédié (chaque action d'écriture est revérifiée côté serveur).
		 *
		 * @param {string} code
		 */
		fail: function ( code ) {
			mw.notify(
				mw.msg( code === 'blocked' ? 'collabpatrol-error-blocked' : 'collabpatrol-notify-error' ),
				{ type: 'error' }
			);
		},

		/** @return {jQuery.Promise} Résolue avec l'entrée (avec historique et compteur) ou null */
		getEntry: function ( revId ) {
			return api.get( { subaction: 'get', revid: revId } ).then( function ( data ) {
				return result( data ).entry || null;
			} );
		},

		/** @return {jQuery.Promise} Résolue avec l'entrée à jour */
		setStatus: function ( revId, status, comment ) {
			return api.postWithToken( 'csrf', {
				subaction: 'set',
				revid: revId,
				status: status,
				comment: comment || ''
			} ).then( function ( data ) {
				return result( data ).entry || null;
			} );
		},

		removeEntry: function ( revId ) {
			return api.postWithToken( 'csrf', { subaction: 'remove', revid: revId } );
		},

		listEntries: function ( status ) {
			return api.get( { subaction: 'list', filterstatus: status || 'all' } ).then( function ( data ) {
				return result( data ).entries || [];
			} );
		},

		getStats: function () {
			return api.get( { subaction: 'stats' } ).then( function ( data ) {
				return result( data ).stats || {};
			} );
		},

		/** @return {jQuery.Promise} Résolue avec une table revId => entrée */
		batchGet: function ( revIds ) {
			if ( !revIds || !revIds.length ) {
				return $.Deferred().resolve( {} ).promise();
			}
			return api.get( { subaction: 'batchget', revids: revIds.join( '|' ) } ).then( function ( data ) {
				var map = {};
				( result( data ).entries || [] ).forEach( function ( entry ) {
					map[ entry.revId ] = entry;
				} );
				return map;
			} );
		},

		/**
		 * Messages du chat. Avec afterId, seuls les nouveaux messages sont renvoyés
		 * (plus la liste des messages déjà connus qui ont été supprimés depuis).
		 */
		chatGet: function ( revId, afterId ) {
			return api.get( { subaction: 'chat_get', revid: revId, afterid: afterId || 0 } ).then( result );
		},

		chatPost: function ( revId, message ) {
			return api.postWithToken( 'csrf', { subaction: 'chat_post', revid: revId, message: message } ).then( result );
		},

		chatDelete: function ( msgId ) {
			return api.postWithToken( 'csrf', { subaction: 'chat_delete', msgid: msgId } ).then( result );
		}
	};

}() );
