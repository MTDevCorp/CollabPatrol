( function () {
	'use strict';

	var CP = window.CollabPatrol;
	var api = new mw.Api();

	CP.api = {

		getEntry: function ( revId ) {
			return api.get( {
				action: 'collabpatrol',
				subaction: 'get',
				revid: revId
			} ).then( function ( data ) {
				return data.collabpatrol || null;
			} );
		},

		setStatus: function ( revId, status, comment ) {
			return api.postWithToken( 'csrf', {
				action: 'collabpatrol',
				subaction: 'set',
				revid: revId,
				status: status,
				comment: comment || ''
			} ).then( function ( data ) {
				return data.collabpatrol;
			} );
		},

		removeEntry: function ( revId ) {
			return api.postWithToken( 'csrf', {
				action: 'collabpatrol',
				subaction: 'remove',
				revid: revId
			} ).then( function ( data ) {
				return data.collabpatrol;
			} );
		},

		getHistory: function ( revId ) {
			return api.get( {
				action: 'collabpatrol',
				subaction: 'history',
				revid: revId
			} ).then( function ( data ) {
				return ( data.collabpatrol && data.collabpatrol.history ) || [];
			} );
		},

		listEntries: function ( status ) {
			return api.get( {
				action: 'collabpatrol',
				subaction: 'list',
				filterstatus: status || 'all'
			} ).then( function ( data ) {
				return ( data.collabpatrol && data.collabpatrol.entries ) || [];
			} );
		},

		getStats: function () {
			return api.get( {
				action: 'collabpatrol',
				subaction: 'stats'
			} ).then( function ( data ) {
				return ( data.collabpatrol && data.collabpatrol.stats ) || {};
			} );
		},

		batchGet: function ( revIds ) {
			if ( !revIds || !revIds.length ) {
				return $.Deferred().resolve( {} ).promise();
			}
			return api.get( {
				action: 'collabpatrol',
				subaction: 'batchget',
				revids: revIds.join( '|' )
			} ).then( function ( data ) {
				return ( data.collabpatrol && data.collabpatrol.entries ) || {};
			} );
		},

		patrolRevision: function ( revId ) {
			return api.postWithToken( 'patrol', {
				action: 'patrol',
				revid: revId
			} );
		},


		chatGet: function ( revId ) {
			return api.get( {
				action: 'collabpatrol',
				subaction: 'chat_get',
				revid: revId
			} ).then( function ( data ) {
				return data.collabpatrol || { messages: [], isMod: false };
			} );
		},

		chatPost: function ( revId, message ) {
			return api.postWithToken( 'csrf', {
				action: 'collabpatrol',
				subaction: 'chat_post',
				revid: revId,
				message: message
			} ).then( function ( data ) {
				return data.collabpatrol;
			} );
		},

		chatDelete: function ( msgId ) {
			return api.postWithToken( 'csrf', {
				action: 'collabpatrol',
				subaction: 'chat_delete',
				msgid: msgId
			} ).then( function ( data ) {
				return data.collabpatrol;
			} );
		},

		chatBan: function ( userText, reason ) {
			return api.postWithToken( 'csrf', {
				action: 'collabpatrol',
				subaction: 'chat_ban',
				user: userText,
				reason: reason || ''
			} ).then( function ( data ) {
				return data.collabpatrol;
			} );
		},

		chatUnban: function ( userText ) {
			return api.postWithToken( 'csrf', {
				action: 'collabpatrol',
				subaction: 'chat_unban',
				user: userText
			} ).then( function ( data ) {
				return data.collabpatrol;
			} );
		}
	};

}() );
