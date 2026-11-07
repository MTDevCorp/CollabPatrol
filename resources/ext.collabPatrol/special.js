/**
 * CollabPatrol — tableau de bord (Special:CollabPatrol).
 * Éléments natifs uniquement (aucun widget OOUI JS) pour un affichage rapide.
 */
( function () {
	'use strict';

	var CP = window.CollabPatrol;

	if ( mw.config.get( 'wgCanonicalSpecialPageName' ) !== 'CollabPatrol' ) {
		return;
	}

	var $dashboard = $( '#collabpatrol-dashboard' );
	if ( !$dashboard.length ) {
		return;
	}

	var isAdmin = String( $dashboard.data( 'is-admin' ) ) === '1';
	var currentFilter = 'all';
	var lastSig = null;
	var loading = false;

	function signature( entries ) {
		return currentFilter + '#' + entries.map( function ( e ) {
			return [ e.revId, e.status, e.userText, e.timestamp, e.comment,
				Math.floor( ( CP.now() - e.timestamp * 1000 ) / 60000 ) ].join( '|' );
		} ).join( ';' );
	}

	function buildToolbar() {
		var $select = $( '<select>' ).addClass( 'collabpatrol-dash-filter' )
			.attr( 'aria-label', mw.msg( 'collabpatrol-dashboard-col-status' ) );
		[
			[ 'all', mw.msg( 'collabpatrol-dashboard-filter-all' ) ],
			[ 'pending', mw.msg( 'collabpatrol-status-pending' ) ],
			[ 'in_progress', mw.msg( 'collabpatrol-status-in-progress' ) ]
		].forEach( function ( opt ) {
			$select.append( $( '<option>' ).val( opt[ 0 ] ).text( opt[ 1 ] ) );
		} );
		$select.val( currentFilter ).on( 'change', function () {
			currentFilter = $select.val();
			lastSig = null;
			load();
		} );

		return $( '<div>' ).addClass( 'collabpatrol-dash-toolbar' ).append(
			$select,
			CP.w.button( {
				icon: 'reload',
				label: mw.msg( 'collabpatrol-dashboard-refresh' ),
				iconOnly: true,
				onClick: function () {
					lastSig = null;
					load();
				}
			} )
		);
	}

	function act( promise ) {
		promise.then( function () {
			lastSig = null;
			load();
		}, function ( code ) {
			CP.api.fail( code );
		} );
	}

	function buildRow( entry ) {
		var elapsed = CP.now() - entry.timestamp * 1000;
		var urgent = entry.status === 'pending' && elapsed > CP.config.urgencyThreshold;
		var $tr = $( '<tr>' ).toggleClass( 'collabpatrol-dash-row-urgent', urgent );

		$tr.append(
			$( '<td>' ).append( $( '<a>' ).attr( { href: mw.util.getUrl( '', { diff: entry.revId } ), target: '_blank', rel: 'noopener' } ).text( entry.revId ) ),
			$( '<td>' ).append( CP.w.statusBadge( entry, { compact: true } ) ),
			$( '<td>' ).append( $( '<a>' ).attr( 'href', mw.util.getUrl( 'User:' + entry.userText ) ).text( entry.userText ) ),
			$( '<td>' ).text( entry.comment || '' ),
			$( '<td>' ).toggleClass( 'collabpatrol-dash-age-urgent', urgent ).text( CP.formatTimeElapsed( elapsed ) )
		);

		var $inner = $( '<div>' ).addClass( 'collabpatrol-dash-actions-inner' );
		if ( entry.status === 'pending' ) {
			$inner.append( CP.w.button( {
				icon: 'eye', label: mw.msg( 'collabpatrol-btn-take' ), color: 'take', iconOnly: CP.buttonsIconOnly,
				onClick: function () {
					act( CP.api.setStatus( entry.revId, 'in_progress', entry.comment ) );
				}
			} ) );
		} else if ( entry.status === 'in_progress' ) {
			$inner.append( CP.w.button( {
				icon: 'check', label: mw.msg( 'collabpatrol-btn-finish' ), color: 'finish', iconOnly: CP.buttonsIconOnly,
				onClick: function () {
					act( CP.api.setStatus( entry.revId, 'finished', entry.comment ) );
				}
			} ) );
		}
		if ( isAdmin ) {
			$inner.append( CP.w.button( {
				icon: 'close', label: mw.msg( 'collabpatrol-btn-cancel' ), color: 'cancel', iconOnly: true,
				onClick: function () {
					if ( window.confirm( mw.msg( 'collabpatrol-confirm-remove' ) ) ) {
						act( CP.api.removeEntry( entry.revId ) );
					}
				}
			} ) );
		}
		return $tr.append( $( '<td>' ).addClass( 'collabpatrol-dash-actions' ).append( $inner ) );
	}

	function render( entries ) {
		$dashboard.empty().append( buildToolbar() );

		if ( !entries.length ) {
			$dashboard.append( $( '<div>' ).addClass( 'collabpatrol-dash-empty' ).text( '–' ) );
			return;
		}

		var $head = $( '<tr>' );
		[ 'id', 'status', 'user', 'comment', 'age', 'actions' ].forEach( function ( key ) {
			$head.append( $( '<th>' ).text( mw.msg( 'collabpatrol-dashboard-col-' + key ) ) );
		} );

		var $tbody = $( '<tbody>' );
		entries.forEach( function ( entry ) {
			$tbody.append( buildRow( entry ) );
		} );

		$dashboard.append(
			$( '<div>' ).addClass( 'collabpatrol-dash-tablewrap' ).append(
				$( '<table>' ).addClass( 'wikitable collabpatrol-dash-table' )
					.append( $( '<thead>' ).append( $head ), $tbody )
			)
		);
	}

	function load() {
		if ( loading ) {
			return;
		}
		loading = true;
		CP.api.listEntries( currentFilter ).then( function ( entries ) {
			loading = false;
			var sig = signature( entries );
			// Ne redessine que si quelque chose a changé
			if ( sig !== lastSig ) {
				lastSig = sig;
				render( entries );
			}
		}, function ( code ) {
			loading = false;
			CP.api.fail( code );
		} );
	}

	$dashboard.append( $( '<p>' ).text( '…' ) );
	load();
	CP.poll( load, CP.config.refreshInterval );

}() );