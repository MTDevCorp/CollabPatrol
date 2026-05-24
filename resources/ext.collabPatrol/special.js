( function () {
	'use strict';

	var CP = window.CollabPatrol;
	var canonicalPage = mw.config.get( 'wgCanonicalSpecialPageName' );
	var isMainDashboard = canonicalPage === 'CollabPatrol';
	var isUserDashboard = canonicalPage === 'CollabUserDashboard';

	if ( !isMainDashboard && !isUserDashboard ) {
		return;
	}

	var $dashboard = $( '#collabpatrol-dashboard' );
	var $userDashboard = $( '#collabpatrol-user-dashboard' );
	var userDashboardUrl = mw.util.getUrl( 'Special:CollabUserDashboard' );

	if ( isMainDashboard && !$dashboard.length ) {
		return;
	}
	if ( isUserDashboard && !$userDashboard.length ) {
		return;
	}

	var isAdmin = ( $dashboard.data( 'is-admin' ) === 1 || $dashboard.data( 'is-admin' ) === '1' ) ||
		( $userDashboard.data( 'is-admin' ) === 1 || $userDashboard.data( 'is-admin' ) === '1' );
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

	function getDiffUrl( revId ) {
		return mw.util.getUrl( '', { diff: revId } );
	}

	function createDiffLink( revId ) {
		return $( '<a>' ).attr( { href: getDiffUrl( revId ), target: '_blank' } ).text( revId );
	}

	function renderMainDashboard( entries ) {
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
				loadAndRenderMainDashboard();
			}
		} );

		toolbar.append( filterSelect.$element );
		toolbar.append( createBtn( '↺ ' + mw.msg( 'collabpatrol-dashboard-filter-all' ), 'grey', function () {
			loadAndRenderMainDashboard();
		} ) );
		toolbar.append( $( '<a>' )
			.addClass( 'collabpatrol-btn collabpatrol-btn-green' )
			.attr( 'href', userDashboardUrl )
			.text( mw.msg( 'collabpatrol-user-dashboard-open' ) )
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

			tr.append( $( '<td>' ).append( createDiffLink( entry.revId ) ) );
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

			if ( entry.status === 'pending' ) {
				actions.append( createBtn( mw.msg( 'collabpatrol-btn-take' ), 'green', function () {
					CP.api.setStatus( entry.revId, 'in_progress', entry.comment ).then( loadAndRenderMainDashboard );
				} ) );
			} else if ( entry.status === 'in_progress' ) {
				actions.append( createBtn( mw.msg( 'collabpatrol-btn-finish' ), 'green', function () {
					CP.api.setStatus( entry.revId, 'finished', entry.comment ).then( loadAndRenderMainDashboard );
				} ) );
			}

			if ( isAdmin ) {
				actions.append( createBtn( '✕', 'grey', function () {
					if ( !window.confirm( mw.msg( 'collabpatrol-confirm-remove' ) ) ) {
						return;
					}
					CP.api.removeEntry( entry.revId ).then( loadAndRenderMainDashboard );
				} ) );

				var blockUrl = mw.util.getUrl( 'Special:Block/' + entry.userText );
				actions.append(
					$( '<a>' )
						.addClass( 'collabpatrol-btn collabpatrol-btn-red' )
						.attr( { href: blockUrl, target: '_blank' } )
						.text( mw.msg( 'collabpatrol-btn-ban' ) )
				);
			}

			tr.append( actions );
			tbody.append( tr );
		} );

		table.append( tbody );
		$dashboard.append( table );
	}

	function renderUserDashboard( data ) {
		$userDashboard.empty();

		$userDashboard.append(
			$( '<p>' )
				.addClass( 'collabpatrol-userdash-help' )
				.text( mw.msg( 'collabpatrol-userdash-helptext' ) )
		);

		var sections = [
			{
				id: 'mentions',
				title: mw.msg( 'collabpatrol-userdash-section-mentions' ),
				empty: mw.msg( 'collabpatrol-userdash-empty-mentions' ),
				rows: data.mentions || []
			},
			{
				id: 'inprogress',
				title: mw.msg( 'collabpatrol-userdash-section-inprogress' ),
				empty: mw.msg( 'collabpatrol-userdash-empty-inprogress' ),
				rows: data.inProgress || []
			},
			{
				id: 'suggested',
				title: mw.msg( 'collabpatrol-userdash-section-suggested' ),
				empty: mw.msg( 'collabpatrol-userdash-empty-suggested' ),
				rows: data.suggestedPending || []
			}
		];

		sections.forEach( function ( section ) {
			var block = $( '<section>' ).addClass( 'collabpatrol-userdash-section' );
			block.append( $( '<h2>' ).text( section.title ) );

			if ( !section.rows.length ) {
				block.append( $( '<p>' ).text( section.empty ) );
				$userDashboard.append( block );
				return;
			}

			var table = $( '<table>' ).addClass( 'wikitable collabpatrol-userdash-table' );
			table.append(
				$( '<thead>' ).append(
					$( '<tr>' ).append(
						$( '<th>' ).text( mw.msg( 'collabpatrol-userdash-col-revision' ) ),
						$( '<th>' ).text( mw.msg( 'collabpatrol-userdash-col-status' ) ),
						$( '<th>' ).text( mw.msg( 'collabpatrol-userdash-col-from' ) ),
						$( '<th>' ).text( mw.msg( 'collabpatrol-userdash-col-message' ) ),
						$( '<th>' ).text( mw.msg( 'collabpatrol-userdash-col-age' ) ),
						$( '<th>' ).text( mw.msg( 'collabpatrol-userdash-col-actions' ) )
					)
				)
			);

			var tbody = $( '<tbody>' );
			section.rows.forEach( function ( row ) {
				var revId = row.revId;
				var rowTime = section.id === 'mentions' ? row.mentionTimestamp : row.timestamp;
				var elapsed = CP.now() - rowTime * 1000;
				var tr = $( '<tr>' );

				tr.append( $( '<td>' ).append( createDiffLink( revId ) ) );
				tr.append( $( '<td>' ).append( buildStatusBadge( row.status ) ) );

				if ( section.id === 'mentions' ) {
					tr.append( $( '<td>' ).text( row.fromUserText ) );
					tr.append( $( '<td>' ).text( row.message || row.entryComment || '' ) );
				} else {
					tr.append( $( '<td>' ).text( row.userText ) );
					tr.append( $( '<td>' ).text( row.comment || '' ) );
				}

				tr.append( $( '<td>' ).text( CP.formatTimeElapsed( elapsed ) ) );

				var actions = $( '<td>' ).addClass( 'collabpatrol-dash-actions' );
				actions.append(
					$( '<a>' )
						.addClass( 'collabpatrol-btn collabpatrol-btn-grey' )
						.attr( { href: getDiffUrl( revId ), target: '_blank' } )
						.text( mw.msg( 'collabpatrol-userdash-open-diff' ) )
				);

				if ( section.id === 'suggested' && row.status === 'pending' ) {
					actions.append( createBtn( mw.msg( 'collabpatrol-userdash-take' ), 'green', function () {
						CP.api.setStatus( revId, 'in_progress', row.comment || '' ).then( loadAndRenderUserDashboard );
					} ) );
				}
				if ( section.id === 'inprogress' && row.status === 'in_progress' ) {
					actions.append( createBtn( mw.msg( 'collabpatrol-userdash-finish' ), 'green', function () {
						CP.api.setStatus( revId, 'finished', row.comment || '' ).then( loadAndRenderUserDashboard );
					} ) );
				}

				tr.append( actions );
				tbody.append( tr );
			} );

			table.append( tbody );
			block.append( table );
			$userDashboard.append( block );
		} );
	}

	function loadAndRenderMainDashboard() {
		$dashboard.html( '<p>…</p>' );
		CP.api.listEntries( currentFilter ).then( function ( entries ) {
			renderMainDashboard( entries );
		} );
	}

	function loadAndRenderUserDashboard() {
		$userDashboard.html( '<p>…</p>' );
		CP.api.getUserDashboard().then( function ( data ) {
			renderUserDashboard( data );
		} );
	}

	if ( isMainDashboard ) {
		loadAndRenderMainDashboard();
		if ( CP.config.refreshInterval > 0 ) {
			setInterval( loadAndRenderMainDashboard, CP.config.refreshInterval );
		}
	}

	if ( isUserDashboard ) {
		loadAndRenderUserDashboard();
		if ( CP.config.refreshInterval > 0 ) {
			setInterval( loadAndRenderUserDashboard, CP.config.refreshInterval );
		}
	}

}() );
