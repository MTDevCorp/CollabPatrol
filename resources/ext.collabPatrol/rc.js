( function () {
	'use strict';

	var CP = window.CollabPatrol;
	var canonicalPage = mw.config.get( 'wgCanonicalSpecialPageName' );

	if ( canonicalPage !== 'Recentchanges' && canonicalPage !== 'Watchlist' ) {
		return;
	}

	function collectRevIds() {
		var ids = [];
		$( '.mw-changeslist-line a, .mw-enhanced-rc-nested a' ).each( function () {
			var href = $( this ).attr( 'href' ) || '';
			var match = href.match( /[?&](diff|oldid)=(\d+)/ );
			if ( match ) {
				var id = parseInt( match[ 2 ], 10 );
				if ( ids.indexOf( id ) === -1 ) {
					ids.push( id );
				}
			}
		} );
		return ids;
	}

	function renderDots( entries ) {
		$( '.collabpatrol-rc-dot' ).remove();
		$( '.mw-changeslist-line a, .mw-enhanced-rc-nested a' ).each( function () {
			var href = $( this ).attr( 'href' ) || '';
			var match = href.match( /[?&](diff|oldid)=(\d+)/ );
			if ( !match ) {
				return;
			}
			var id = parseInt( match[ 2 ], 10 );
			var entry = entries[ id ];
			if ( !entry ) {
				return;
			}

			var dotClass = entry.status === 'pending'
				? 'collabpatrol-rc-dot-pending'
				: 'collabpatrol-rc-dot-progress';
			var title = CP.getStatusLabel( entry.status );
			if ( entry.comment ) {
				title += ': ' + entry.comment;
			}

			var dot = $( '<span>' )
				.addClass( 'collabpatrol-rc-dot ' + dotClass )
				.text( '●' )
				.attr( 'title', title );

			if ( $( this ).prev( '.collabpatrol-rc-dot' ).length === 0 ) {
				$( this ).before( dot );
			}
		} );
	}

	function renderCounter( entries ) {
		$( '.collabpatrol-rc-counter' ).remove();

		var pending = 0;
		var inProgress = 0;
		Object.keys( entries ).forEach( function ( id ) {
			if ( entries[ id ].status === 'pending' ) {
				pending++;
			} else if ( entries[ id ].status === 'in_progress' ) {
				inProgress++;
			}
		} );

		var counter = $( '<div>' ).addClass( 'collabpatrol-rc-counter' );
		counter.html(
			'<span class="collabpatrol-rc-counter-pending">🔴 ' +
			mw.msg( 'collabpatrol-counter-pending', pending ) +
			'</span> | <span class="collabpatrol-rc-counter-progress">🟡 ' +
			mw.msg( 'collabpatrol-counter-progress', inProgress ) +
			'</span>'
		);

		var dashLink = $( '<a>' )
			.addClass( 'collabpatrol-rc-dash-link' )
			.attr( 'href', mw.util.getUrl( 'Special:CollabPatrol' ) )
			.text( '📋 ' + mw.msg( 'collabpatrol-dashboard-title' ) );

		counter.append( ' ' ).append( dashLink );

		var target = $( '.mw-rcfilters-ui-top-section' ).first();
		if ( !target.length ) {
			target = $( '#contentSub' ).first();
		}
		if ( target.length ) {
			target.append( counter );
		}
	}

	function updateRC() {
		var revIds = collectRevIds();
		if ( !revIds.length ) {
			return;
		}
		CP.api.batchGet( revIds ).then( function ( entries ) {
			renderDots( entries );
			if ( canonicalPage === 'Recentchanges' ) {
				renderCounter( entries );
			}
		} );
	}

	mw.hook( 'wikipage.content' ).add( function () {
		updateRC();
	} );

	if ( CP.config.refreshInterval > 0 ) {
		setInterval( updateRC, CP.config.refreshInterval );
	}

}() );
