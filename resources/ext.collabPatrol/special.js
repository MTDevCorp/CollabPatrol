( function () {
	'use strict';

	var CP = window.CollabPatrol;
	var canonicalPage = mw.config.get( 'wgCanonicalSpecialPageName' );

	if ( canonicalPage !== 'CollabPatrol' ) {
		return;
	}

	var $dashboard = $( '#collabpatrol-dashboard' );
	if ( !$dashboard.length ) {
		return;
	}

	var isAdmin = $dashboard.data( 'is-admin' ) === 1 || $dashboard.data( 'is-admin' ) === '1';
	var currentFilter = 'all';

	function createBtn( label, cls, onClick ) {
		return $( '<button>' )
			.addClass( 'collabpatrol-btn collabpatrol-btn-' + cls )
			.text( label )
			.on( 'click', onClick );
	}

	function buildStatusBadge( status ) {
		var label = CP.getStatusLabel( status );
		var cls = 'collabpatrol-badge ';
		if ( status === 'pending' ) {
			cls += 'collabpatrol-badge-pending';
		} else if ( status === 'in_progress' ) {
			cls += 'collabpatrol-badge-progress';
		} else {
			cls += 'collabpatrol-badge-finished';
		}
		return $( '<span>' ).addClass( cls ).text( label );
	}

	function renderDashboard( entries ) {
		$dashboard.empty();

		var toolbar = $( '<div>' ).addClass( 'collabpatrol-dash-toolbar' );

		var filterSelect = new OO.ui.DropdownWidget( {
			menu: {
				items: [
					new OO.ui.MenuOptionWidget( { data: 'all', label: mw.msg( 'collabpatrol-dashboard-filter-all' ) } ),
					new OO.ui.MenuOptionWidget( { data: 'pending', label: mw.msg( 'collabpatrol-status-pending' ) } ),
					new OO.ui.MenuOptionWidget( { data: 'in_progress', label: mw.msg( 'collabpatrol-status-in-progress' ) } )
				]
			}
		} );
		filterSelect.getMenu().selectItemByData( currentFilter );
		filterSelect.getMenu().on( 'select', function ( item ) {
			if ( item ) {
				currentFilter = item.getData();
				loadAndRender();
			}
		} );

		toolbar.append( filterSelect.$element );
		toolbar.append(
			createBtn( '↺ ' + mw.msg( 'collabpatrol-dashboard-filter-all' ), 'grey', function () {
				loadAndRender();
			} )
		);
		$dashboard.append( toolbar );

		if ( !entries.length ) {
			$dashboard.append( $( '<p>' ).text( '–' ) );
			return;
		}

		var table = $( '<table>' ).addClass( 'wikitable sortable collabpatrol-dash-table' );
		var thead = $( '<thead>' ).append(
			$( '<tr>' ).append(
				$( '<th>' ).text( mw.msg( 'collabpatrol-dashboard-col-id' ) ),
				$( '<th>' ).text( mw.msg( 'collabpatrol-dashboard-col-status' ) ),
				$( '<th>' ).text( mw.msg( 'collabpatrol-dashboard-col-user' ) ),
				$( '<th>' ).text( mw.msg( 'collabpatrol-dashboard-col-comment' ) ),
				$( '<th>' ).text( mw.msg( 'collabpatrol-dashboard-col-age' ) ),
				$( '<th>' ).text( mw.msg( 'collabpatrol-dashboard-col-actions' ) )
			)
		);
		table.append( thead );

		var tbody = $( '<tbody>' );

		entries.forEach( function ( entry ) {
			var elapsed = CP.now() - entry.timestamp * 1000;
			var isUrgent = entry.status === 'pending' && elapsed > CP.config.urgencyThreshold;

			var tr = $( '<tr>' );
			if ( isUrgent ) {
				tr.addClass( 'collabpatrol-dash-row-urgent' );
			}

			var diffUrl = mw.util.getUrl( '', { diff: entry.revId } );
			tr.append(
				$( '<td>' ).append( $( '<a>' ).attr( { href: diffUrl, target: '_blank' } ).text( entry.revId ) )
			);
			tr.append( $( '<td>' ).append( buildStatusBadge( entry.status ) ) );

			var userLink = $( '<a>' )
				.attr( 'href', mw.util.getUrl( 'User:' + entry.userText ) )
				.text( entry.userText );
			tr.append( $( '<td>' ).append( userLink ) );

			tr.append( $( '<td>' ).text( entry.comment || '' ) );

			var ageCell = $( '<td>' ).text( CP.formatTimeElapsed( elapsed ) );
			if ( isUrgent ) {
				ageCell.css( 'color', '#721c24' ).css( 'font-weight', 'bold' );
			}
			tr.append( ageCell );

			var actions = $( '<td>' ).addClass( 'collabpatrol-dash-actions' );

			( function ( e ) {
				if ( e.status === 'pending' ) {
					actions.append( createBtn( mw.msg( 'collabpatrol-btn-take' ), 'green', function () {
						CP.api.setStatus( e.revId, 'in_progress', e.comment ).then( loadAndRender );
					} ) );
				} else if ( e.status === 'in_progress' ) {
					actions.append( createBtn( mw.msg( 'collabpatrol-btn-finish' ), 'green', function () {
						CP.api.setStatus( e.revId, 'finished', e.comment ).then( loadAndRender );
					} ) );
				}

				if ( isAdmin ) {
					actions.append( ' ' );
					actions.append( createBtn( '✕', 'grey', function () {
						if ( !window.confirm( mw.msg( 'collabpatrol-confirm-remove' ) ) ) {
							return;
						}
						CP.api.removeEntry( e.revId ).then( loadAndRender );
					} ) );

					actions.append( ' ' );
					var blockUrl = mw.util.getUrl( 'Special:Block/' + e.userText );
					actions.append(
						$( '<a>' )
							.addClass( 'collabpatrol-btn collabpatrol-btn-red' )
							.attr( { href: blockUrl, target: '_blank' } )
							.text( mw.msg( 'collabpatrol-btn-ban' ) )
					);
				}
			}( entry ) );

			tr.append( actions );
			tbody.append( tr );
		} );

		table.append( tbody );
		$dashboard.append( table );
	}

	function loadAndRender() {
		$dashboard.html( '<p>…</p>' );
		CP.api.listEntries( currentFilter ).then( function ( entries ) {
			renderDashboard( entries );
		} );
	}

	loadAndRender();
	if ( CP.config.refreshInterval > 0 ) {
		setInterval( loadAndRender, CP.config.refreshInterval );
	}

}() );
