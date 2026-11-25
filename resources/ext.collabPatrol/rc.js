/**
 * CollabPatrol — pastilles et compteur sur Modifications récentes / Liste de suivi.
 *
 * Les pastilles sont déjà posées par le serveur (une seule requête SQL groupée) ;
 * ce script ne fait qu'un appel groupé pour le compteur et pour garder les
 * pastilles à jour (nouvelles lignes, changement d'état).
 */
( function () {
	'use strict';

	var CP = window.CollabPatrol;
	var canonicalPage = mw.config.get( 'wgCanonicalSpecialPageName' );

	if ( canonicalPage !== 'Recentchanges' && canonicalPage !== 'Watchlist' ) {
		return;
	}

	var counterSig = '';

	/** @return {Object} revId => [ lignes DOM ] */
	function collectLines() {
		var map = {};
		var found = false;
		$( '.mw-changeslist-line[data-mw-revid]' ).each( function () {
			var id = parseInt( this.getAttribute( 'data-mw-revid' ), 10 );
			if ( id ) {
				found = true;
				( map[ id ] = map[ id ] || [] ).push( this );
			}
		} );
		if ( found ) {
			return map;
		}
		// Repli : lecture des liens diff/oldid
		$( '.mw-changeslist-line' ).each( function () {
			var line = this;
			$( line ).find( 'a' ).each( function () {
				var m = ( $( this ).attr( 'href' ) || '' ).match( /[?&](?:diff|oldid)=(\d+)/ );
				if ( m ) {
					var id = parseInt( m[ 1 ], 10 );
					map[ id ] = map[ id ] || [];
					if ( map[ id ].indexOf( line ) === -1 ) {
						map[ id ].push( line );
					}
					return false;
				}
			} );
		} );
		return map;
	}

	function updateDots( lines, entries ) {
		Object.keys( lines ).forEach( function ( id ) {
			var entry = entries[ id ];
			var active = entry && ( entry.status === 'pending' || entry.status === 'in_progress' );
			lines[ id ].forEach( function ( line ) {
				var $title = $( line ).find( '.mw-changeslist-title' ).first();
				if ( !$title.length ) {
					return;
				}
				var $dot = $title.prev( '.collabpatrol-rc-dot' );
				if ( !active ) {
					$dot.remove();
					return;
				}
				var cls = entry.status === 'pending' ? 'pending' : 'progress';
				var title = CP.getStatusLabel( entry.status ) + ( entry.comment ? ' : ' + entry.comment : '' );
				if ( !$dot.length ) {
					$dot = $( '<span>' ).attr( 'role', 'img' );
					$title.before( $dot, ' ' );
				}
				$dot.attr( { title: title, 'aria-label': title } )
					.attr( 'class', 'collabpatrol-rc-dot collabpatrol-rc-dot-' + cls );
			} );
		} );
	}

	function updateCounter( entries ) {
		var pending = 0;
		var progress = 0;
		Object.keys( entries ).forEach( function ( id ) {
			if ( entries[ id ].status === 'pending' ) {
				pending++;
			} else if ( entries[ id ].status === 'in_progress' ) {
				progress++;
			}
		} );

		var sig = pending + '|' + progress;
		if ( sig === counterSig && $( '.collabpatrol-rc-counter' ).length ) {
			return;
		}
		counterSig = sig;
		$( '.collabpatrol-rc-counter' ).remove();

		var $counter = $( '<div>' ).addClass( 'collabpatrol-rc-counter' ).append(
			$( '<span>' ).addClass( 'collabpatrol-rc-counter-pending' ).append(
				$( '<span>' ).addClass( 'collabpatrol-rc-dot collabpatrol-rc-dot-pending' ),
				' ' + mw.msg( 'collabpatrol-counter-pending', pending )
			),
			$( '<span>' ).addClass( 'collabpatrol-rc-counter-progress' ).append(
				$( '<span>' ).addClass( 'collabpatrol-rc-dot collabpatrol-rc-dot-progress' ),
				' ' + mw.msg( 'collabpatrol-counter-progress', progress )
			),
			$( '<a>' ).addClass( 'collabpatrol-rc-dash-link' )
				.attr( 'href', mw.util.getUrl( 'Special:CollabPatrol' ) )
				.text( mw.msg( 'collabpatrol-dashboard-title' ) )
		);

		var $target = $( '.mw-rcfilters-ui-top-section' ).first();
		if ( !$target.length ) {
			$target = $( '#contentSub' ).first();
		}
		$target.append( $counter );
	}

	function updateRC() {
		var lines = collectLines();
		var ids = Object.keys( lines ).map( Number );
		if ( !ids.length ) {
			return;
		}
		CP.api.batchGet( ids ).then( function ( entries ) {
			updateDots( lines, entries );
			if ( canonicalPage === 'Recentchanges' ) {
				updateCounter( entries );
			}
		} );
	}

	mw.hook( 'wikipage.content' ).add( updateRC );
	CP.poll( updateRC, CP.config.refreshInterval );

}() );
