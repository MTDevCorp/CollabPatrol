( function () {
	'use strict';

	var CP = window.CollabPatrol;
	var skin = mw.config.get( 'skin' );

	if ( skin === 'minerva' ) {
		return;
	}

	function promptComment( defaultComment ) {
		return new Promise( function ( resolve ) {
			var selectWidget = new OO.ui.DropdownWidget( {
				menu: {
					items: CP.config.commentTemplates.map( function ( tpl ) {
						return new OO.ui.MenuOptionWidget( { data: tpl, label: tpl } );
					} )
				}
			} );

			var textInput = new OO.ui.TextInputWidget( {
				value: defaultComment || '',
				placeholder: mw.msg( 'collabpatrol-comment-placeholder' )
			} );

			selectWidget.getMenu().on( 'select', function ( item ) {
				if ( item ) {
					textInput.setValue( item.getData() );
				}
			} );

			var dialog = new OO.ui.MessageDialog();
			var windowManager = new OO.ui.WindowManager();
			$( document.body ).append( windowManager.$element );
			windowManager.addWindows( [ dialog ] );

			var panel = new OO.ui.PanelLayout( {
				padded: true,
				expanded: false,
				content: [
					new OO.ui.FieldLayout( selectWidget, { label: mw.msg( 'collabpatrol-template-other' ) + ' :', align: 'top' } ),
					new OO.ui.FieldLayout( textInput, { label: mw.msg( 'collabpatrol-comment-placeholder' ) + ' :', align: 'top' } )
				]
			} );

			windowManager.openWindow( dialog, {
				title: mw.msg( 'collabpatrol-comment-placeholder' ),
				message: panel.$element,
				actions: [
					{ action: 'save', label: 'OK', flags: [ 'primary', 'progressive' ] },
					{ action: 'cancel', label: mw.msg( 'cancel' ), flags: 'safe' }
				]
			} ).closed.then( function ( data ) {
				if ( data && data.action === 'save' ) {
					resolve( textInput.getValue() );
				} else {
					resolve( null );
				}
				windowManager.$element.remove();
			} );
		} );
	}

	function buildBadge( entry ) {
		var elapsed = CP.now() - entry.timestamp * 1000;
		var isUrgent = entry.status === 'pending' && elapsed > CP.config.urgencyThreshold;

		var cssClass = 'collabpatrol-badge ';
		if ( entry.status === 'pending' ) {
			cssClass += isUrgent ? 'collabpatrol-badge-urgent' : 'collabpatrol-badge-pending';
		} else if ( entry.status === 'in_progress' ) {
			cssClass += 'collabpatrol-badge-progress';
		} else {
			cssClass += 'collabpatrol-badge-finished';
		}

		var label = CP.getStatusLabel( entry.status );
		var text = label + ' — ' + entry.userText;
		if ( entry.comment ) {
			text += ' (' + entry.comment + ')';
		}
		text += ' • ' + CP.formatTimeElapsed( elapsed );

		return $( '<span>' ).addClass( cssClass ).text( text );
	}

	function buildHistoryBlock( history ) {
		var div = $( '<div>' ).addClass( 'collabpatrol-history' );
		div.append( $( '<strong>' ).text( mw.msg( 'collabpatrol-history-label' ) ) );

		history.forEach( function ( h ) {
			var elapsed = CP.now() - h.timestamp * 1000;
			var actionLabel = CP.getStatusLabel( h.action );
			var item = $( '<div>' ).addClass( 'collabpatrol-history-item' );
			var txt = actionLabel + ' — ' + h.userText + ' ' + CP.formatTimeElapsed( elapsed );
			if ( h.comment ) {
				txt += ' • ' + h.comment;
			}
			item.text( txt );
			div.append( item );
		} );

		return div;
	}

	function createBtn( label, cls, onClick ) {
		return $( '<button>' )
			.addClass( 'collabpatrol-btn collabpatrol-btn-' + cls )
			.text( label )
			.on( 'click', onClick );
	}

	function renderWrapper( revId, entry ) {
		$( '.collabpatrol-wrapper' ).remove();

		var target = $( '.mw-diff-ntitle1' ).first();
		if ( !target.length ) {
			target = $( '#contentSub' ).first();
		}
		if ( !target.length ) {
			return;
		}

		var wrapper = $( '<div>' ).addClass( 'collabpatrol-wrapper' );
		if ( CP.config.compactMode ) {
			wrapper.addClass( 'collabpatrol-wrapper-compact' );
		}

		if ( !entry ) {
			if ( CP.isUnpatrolled() ) {
				wrapper.append(
					createBtn( '⏳ ' + mw.msg( 'collabpatrol-btn-flag' ), 'yellow', function () {
						promptComment( '' ).then( function ( comment ) {
							if ( comment === null ) {
								return;
							}
							CP.api.setStatus( revId, 'pending', comment ).then( function () {
								renderInterface();
							} );
						} );
					} )
				);
			} else {
				return;
			}
		} else {
			wrapper.append( buildBadge( entry ) );

			if ( entry.status === 'pending' ) {
				wrapper.append( createBtn( mw.msg( 'collabpatrol-btn-take' ), 'green', function () {
					CP.api.setStatus( revId, 'in_progress', entry.comment ).then( function () {
						renderInterface();
					} );
				} ) );
			} else if ( entry.status === 'in_progress' ) {
				wrapper.append( createBtn( mw.msg( 'collabpatrol-btn-finish' ), 'green', function () {
					CP.api.setStatus( revId, 'finished', entry.comment ).then( function () {
						if ( CP.config.notifyFinished ) {
							mw.notify( mw.msg( 'collabpatrol-notify-patrolled' ) );
						}
						renderInterface();
					} );
				} ) );
			}

			if ( CP.config.isAdmin || entry.userText === CP.userName ) {
				wrapper.append( createBtn( mw.msg( 'collabpatrol-btn-cancel' ), 'grey', function () {
					if ( !window.confirm( mw.msg( 'collabpatrol-confirm-remove' ) ) ) {
						return;
					}
					CP.api.removeEntry( revId ).then( function () {
						renderInterface();
					} );
				} ) );
			}

			if ( CP.config.isAdmin && entry.userText ) {
				wrapper.append( createBtn( mw.msg( 'collabpatrol-btn-ban' ), 'red', function () {
					if ( !window.confirm( mw.msg( 'collabpatrol-confirm-ban' ) + ' ' + entry.userText + ' ?' ) ) {
						return;
					}
					var blockUrl = mw.util.getUrl( 'Special:Block/' + entry.userText );
					window.open( blockUrl, '_blank' );
				} ) );
			}

			if ( CP.config.showHistory && entry.history && entry.history.length > 1 ) {
				wrapper.append( buildHistoryBlock( entry.history ) );
			}

			if ( entry.status !== 'finished' ) {
				mw.hook( 'collabpatrol.entryActive' ).fire( revId, entry );
			} else {
				mw.hook( 'collabpatrol.entryFinished' ).fire( revId );
			}
		}

		if ( target.hasClass( 'mw-diff-ntitle1' ) ) {
			target.append( wrapper );
		} else {
			target.after( wrapper );
		}
	}

	function renderInterface() {
		var revId = CP.getRevId();
		if ( !revId ) {
			return;
		}
		CP.api.getEntry( revId ).then( function ( entry ) {
			renderWrapper( revId, entry );
		} );
	}

	CP.renderDesktopInterface = renderInterface;

	mw.hook( 'wikipage.content' ).add( function () {
		var revId = CP.getRevId();
		if ( revId ) {
			renderInterface();
		}
	} );

}() );
