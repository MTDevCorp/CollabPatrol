/**
 * CollabPatrol — interface Minerva (mobile), construite avec OOUI.
 * Mêmes widgets et mêmes classes CSS que la version bureau (ui.js / chat.js).
 */
( function () {
	'use strict';

	var CP = window.CollabPatrol;

	if ( mw.config.get( 'skin' ) !== 'minerva' ) {
		return;
	}

	var MAX_LEN = mw.config.get( 'wgCollabPatrolChatMaxLength' ) || 500;
	var chatRevId = null;
	var isMod = false;
	var isChatBanned = false;
	var bannedUsers = {};
	var isOpen = false;
	var refreshTimer = null;
	var $chatPanel = null;
	var toggleButton = null;
	var composerWidgets = null;

	/* ---------- Widgets ---------- */

	function createBtn( label, cls, onClick, icon ) {
		var flagsByColor = {
			green: [ 'primary', 'progressive' ],
			yellow: [ 'progressive' ],
			red: [ 'destructive' ],
			grey: []
		};
		var button = new OO.ui.ButtonWidget( {
			label: label,
			icon: icon,
			flags: flagsByColor[ cls ] || [],
			framed: true
		} );
		button.on( 'click', onClick );
		return button.$element.addClass( 'collabpatrol-btn-widget collabpatrol-btn-widget-' + cls );
	}

	function promptComment( defaultComment ) {
		return new Promise( function ( resolve ) {
			var select = new OO.ui.DropdownWidget( {
				menu: {
					items: CP.config.commentTemplates.map( function ( tpl ) {
						return new OO.ui.MenuOptionWidget( { data: tpl, label: tpl } );
					} )
				}
			} );
			var input = new OO.ui.TextInputWidget( {
				value: defaultComment || '',
				placeholder: mw.msg( 'collabpatrol-comment-placeholder' )
			} );
			select.getMenu().on( 'select', function ( item ) {
				if ( item ) {
					input.setValue( item.getData() );
				}
			} );

			var dialog = new OO.ui.MessageDialog();
			var wm = new OO.ui.WindowManager();
			$( document.body ).append( wm.$element );
			wm.addWindows( [ dialog ] );

			var panel = new OO.ui.PanelLayout( {
				padded: true,
				expanded: false,
				content: [
					new OO.ui.FieldLayout( select, { label: mw.msg( 'collabpatrol-template-other' ) + ' :', align: 'top' } ),
					new OO.ui.FieldLayout( input, { label: mw.msg( 'collabpatrol-comment-placeholder' ) + ' :', align: 'top' } )
				]
			} );

			wm.openWindow( dialog, {
				title: mw.msg( 'collabpatrol-comment-placeholder' ),
				message: panel.$element,
				actions: [
					{ action: 'save', label: 'OK', flags: [ 'primary', 'progressive' ] },
					{ action: 'cancel', label: mw.msg( 'cancel' ), flags: 'safe' }
				]
			} ).closed.then( function ( data ) {
				resolve( data && data.action === 'save' ? input.getValue() : null );
				wm.$element.remove();
			} );
		} );
	}

	function buildBadge( entry ) {
		var elapsed = CP.now() - entry.timestamp * 1000;
		var isUrgent = entry.status === 'pending' && elapsed > CP.config.urgencyThreshold;
		var text = CP.getStatusLabel( entry.status ) + ' — ' + entry.userText;
		if ( entry.comment ) {
			text += ' (' + entry.comment + ')';
		}
		var $label = $( '<span>' ).append(
			$( '<strong>' ).text( text ),
			$( '<span>' ).addClass( 'collabpatrol-badge-time' ).text( ' • ' + CP.formatTimeElapsed( elapsed ) )
		);
		return CP.buildStatusWidget( entry.status, isUrgent, $label, true );
	}

	function buildHistoryBlock( history ) {
		var div = $( '<div>' ).addClass( 'collabpatrol-history' );
		div.append( $( '<strong>' ).text( mw.msg( 'collabpatrol-history-label' ) ) );
		history.forEach( function ( h ) {
			var txt = CP.getStatusLabel( h.action ) + ' — ' + h.userText + ' ' +
				CP.formatTimeElapsed( CP.now() - h.timestamp * 1000 );
			if ( h.comment ) {
				txt += ' • ' + h.comment;
			}
			div.append( $( '<div>' ).addClass( 'collabpatrol-history-item' ).text( txt ) );
		} );
		return div;
	}

	/* ---------- Chat ---------- */

	function showError( $el, msg ) {
		$el.empty().append( new OO.ui.MessageWidget( { type: 'error', label: msg } ).$element ).show();
		setTimeout( function () {
			$el.fadeOut();
		}, 4000 );
	}

	function buildComposer( revId ) {
		var $composer = $( '<div>' ).addClass( 'cp-chat-composer' );
		var inputWidget = new OO.ui.MultilineTextInputWidget( {
			placeholder: mw.msg( 'collabpatrol-chat-placeholder' ),
			maxLength: MAX_LEN,
			rows: 2,
			autosize: true,
			maxRows: 6,
			classes: [ 'cp-chat-input' ]
		} );
		var $counter = $( '<span>' ).addClass( 'cp-chat-char-counter' ).text( '0/' + MAX_LEN );
		var sendButton = new OO.ui.ButtonWidget( {
			label: mw.msg( 'collabpatrol-chat-btn-send' ),
			icon: 'speechBubble',
			flags: [ 'primary', 'progressive' ],
			framed: true,
			classes: [ 'cp-chat-send' ]
		} );
		var $error = $( '<div>' ).addClass( 'cp-chat-error' ).hide();
		composerWidgets = { input: inputWidget, send: sendButton, $error: $error };

		inputWidget.$input.on( 'input', function () {
			var len = $( this ).val().length;
			$counter.text( len + '/' + MAX_LEN ).toggleClass( 'cp-chat-char-counter-over', len > MAX_LEN );
		} );

		function send() {
			if ( sendButton.isDisabled() ) {
				return;
			}
			var msg = inputWidget.getValue().trim();
			if ( !msg ) {
				return;
			}
			if ( msg.length > MAX_LEN ) {
				showError( $error, mw.msg( 'collabpatrol-chat-too-long' ) );
				return;
			}
			sendButton.setDisabled( true );
			$error.hide();
			CP.api.chatPost( revId, msg ).then( function ( result ) {
				if ( result && result.result === 'success' ) {
					inputWidget.setValue( '' );
					$counter.text( '0/' + MAX_LEN );
					loadMessages( revId );
				} else {
					showError( $error, mw.msg( 'collabpatrol-chat-send-error' ) );
				}
			} ).catch( function ( code, data ) {
				var errMsg = mw.msg( 'collabpatrol-chat-send-error' );
				var c = data && data.error && data.error.code;
				if ( c === 'banned_word' ) {
					errMsg = mw.msg( 'collabpatrol-chat-banned-word' );
				} else if ( c === 'message_too_long' ) {
					errMsg = mw.msg( 'collabpatrol-chat-too-long' );
				} else if ( c === 'chat_user_banned' ) {
					errMsg = mw.msg( 'collabpatrol-chat-user-banned' );
				}
				showError( $error, errMsg );
			} ).always( function () {
				sendButton.setDisabled( isChatBanned );
			} );
		}

		sendButton.on( 'click', send );
		inputWidget.$input.on( 'keydown', function ( e ) {
			if ( ( e.ctrlKey || e.metaKey ) && e.key === 'Enter' ) {
				send();
			}
		} );

		$composer.append(
			inputWidget.$element,
			$( '<div>' ).addClass( 'cp-chat-composer-row' ).append( $counter, sendButton.$element ),
			$error
		);
		CP.mentions.attachAutocomplete( inputWidget.$input, inputWidget.$element );
		return $composer;
	}

	function setOpenState( open ) {
		isOpen = !!open;
		var $body = $chatPanel.find( '.cp-chat-body' );
		if ( isOpen ) {
			$body.show();
			toggleButton.setLabel( mw.msg( 'collabpatrol-chat-toggle-close' ) ).setIcon( 'collapse' );
		} else {
			$body.hide();
			toggleButton.setLabel( mw.msg( 'collabpatrol-chat-toggle-open' ) ).setIcon( 'expand' );
		}
	}

	function buildChat( revId ) {
		var panel = new OO.ui.PanelLayout( { expanded: false, framed: false, classes: [ 'cp-chat-panel' ] } );
		$chatPanel = panel.$element.attr( 'id', 'cp-chat' );

		var $title = $( '<span>' ).addClass( 'cp-chat-title' ).append(
			new OO.ui.IconWidget( { icon: 'speechBubbles' } ).$element,
			$( '<span>' ).text( mw.msg( 'collabpatrol-chat-title' ) )
		);
		var $count = $( '<span>' ).addClass( 'cp-chat-count' );
		toggleButton = new OO.ui.ButtonWidget( {
			label: mw.msg( 'collabpatrol-chat-toggle-open' ),
			icon: 'expand',
			flags: [ 'progressive' ],
			framed: true,
			classes: [ 'cp-chat-toggle' ]
		} );
		toggleButton.on( 'click', function () {
			setOpenState( !isOpen );
			if ( isOpen ) {
				loadMessages( chatRevId );
			}
		} );

		var $header = $( '<div>' ).addClass( 'cp-chat-header' ).append( $title, $count, toggleButton.$element );
		var $body = $( '<div>' ).addClass( 'cp-chat-body' ).hide().append(
			$( '<div>' ).addClass( 'cp-chat-messages' ),
			buildComposer( revId )
		);
		$chatPanel.append( $header, $body );

		setOpenState( CP.config.chatOpenDefault || window.location.hash === '#cp-chat' );
		loadMessages( revId );
		startRefresh( revId );
		return $chatPanel;
	}

	function loadMessages( revId ) {
		CP.api.chatGet( revId ).then( function ( data ) {
			if ( !$chatPanel ) {
				return;
			}
			isMod = !!data.isMod;
			isChatBanned = !!data.isBanned;
			bannedUsers = data.bannedUsers || {};
			var messages = data.messages || [];
			if ( composerWidgets ) {
				composerWidgets.input.setDisabled( isChatBanned );
				composerWidgets.send.setDisabled( isChatBanned );
				if ( isChatBanned ) {
					showError( composerWidgets.$error, mw.msg( 'collabpatrol-chat-user-banned' ) );
				} else {
					composerWidgets.$error.hide();
				}
			}
			var visible = messages.filter( function ( m ) {
				return !m.deleted;
			} ).length;
			$chatPanel.find( '.cp-chat-count' ).text(
				visible > 0 ? mw.msg( 'collabpatrol-chat-count', visible ) : ''
			);
			if ( isOpen ) {
				renderMessages( revId, messages );
			}
		} );
	}

	function renderMessages( revId, messages ) {
		var $messages = $chatPanel.find( '.cp-chat-messages' ).empty();
		if ( !messages.length ) {
			$messages.append( $( '<p>' ).addClass( 'cp-chat-empty' ).text( mw.msg( 'collabpatrol-chat-empty' ) ) );
			return;
		}
		messages.forEach( function ( msg ) {
			$messages.append( buildMessageRow( revId, msg ) );
		} );
		$messages.scrollTop( $messages[ 0 ].scrollHeight );
	}

	function buildMessageRow( revId, msg ) {
		var $row = $( '<div>' ).addClass( 'cp-chat-msg' ).attr( 'data-msg-id', msg.id );

		if ( msg.deleted ) {
			var tombstone = mw.msg( 'collabpatrol-chat-deleted' );
			if ( isMod && msg.deletedBy ) {
				tombstone += ' (' + msg.deletedBy + ')';
			}
			return $row.addClass( 'cp-chat-msg-deleted' ).append( $( '<em>' ).text( tombstone ) );
		}

		var elapsed = CP.formatTimeElapsed( CP.now() - msg.timestamp * 1000 );
		var $meta = $( '<span>' ).addClass( 'cp-chat-msg-meta' ).append(
			$( '<a>' ).attr( 'href', mw.util.getUrl( 'User:' + msg.userText ) )
				.addClass( 'cp-chat-msg-user' ).text( msg.userText ),
			' · ',
			$( '<span>' ).addClass( 'cp-chat-msg-time' ).text( elapsed )
		);
		var $text = $( '<span>' ).addClass( 'cp-chat-msg-text' );
		if ( CP.mentions.renderText( $text, msg.message, msg.mentions ) ) {
			$row.addClass( 'cp-chat-msg-mentioned' );
		}
		$row.append( $meta, $text );

		if ( isMod || msg.userText === CP.userName ) {
			var delBtn = new OO.ui.ButtonWidget( {
				icon: 'trash',
				title: mw.msg( 'collabpatrol-chat-btn-delete' ),
				framed: false,
				flags: [ 'destructive' ],
				classes: [ 'cp-chat-btn-delete' ]
			} );
			delBtn.on( 'click', function () {
				if ( !window.confirm( mw.msg( 'collabpatrol-chat-confirm-delete' ) ) ) {
					return;
				}
				CP.api.chatDelete( msg.id ).then( function () {
					loadMessages( revId );
				} );
			} );
			$row.append( delBtn.$element );
		}

		if ( isMod && msg.userText !== CP.userName ) {
			var banned = !!bannedUsers[ msg.userText ];
			var banBtn = new OO.ui.ButtonWidget( {
				icon: banned ? 'undo' : 'block',
				title: banned ? mw.msg( 'collabpatrol-chat-btn-unban' ) : mw.msg( 'collabpatrol-chat-btn-ban' ),
				framed: false,
				flags: [ banned ? 'progressive' : 'destructive' ],
				classes: [ 'cp-chat-btn-delete', 'cp-chat-btn-ban' ]
			} );
			banBtn.on( 'click', function () {
				var confirmKey = banned ? 'collabpatrol-chat-confirm-unban' : 'collabpatrol-chat-confirm-ban';
				if ( !window.confirm( mw.msg( confirmKey, msg.userText ) ) ) {
					return;
				}
				var call = banned ? CP.api.chatUnban( msg.userText ) : CP.api.chatBan( msg.userText, '' );
				call.then( function () {
					mw.notify( mw.msg( banned ? 'collabpatrol-chat-unban-success' : 'collabpatrol-chat-ban-success', msg.userText ) );
					loadMessages( revId );
				} );
			} );
			$row.append( banBtn.$element );
		}

		return $row;
	}

	function startRefresh( revId ) {
		stopRefresh();
		if ( CP.config.refreshInterval <= 0 ) {
			return;
		}
		refreshTimer = setInterval( function () {
			if ( isOpen ) {
				loadMessages( revId );
			}
		}, CP.config.refreshInterval );
	}

	function stopRefresh() {
		if ( refreshTimer ) {
			clearInterval( refreshTimer );
			refreshTimer = null;
		}
	}

	/* ---------- Interface principale ---------- */

	function renderInterface() {
		var revId = CP.getRevId();
		if ( !revId ) {
			return;
		}

		CP.api.getEntry( revId ).then( function ( entry ) {
			$( '.collabpatrol-m-container' ).remove();
			stopRefresh();
			$chatPanel = null;
			composerWidgets = null;

			var target = $( '.content, #mw-content-text' ).first();
			if ( !target.length ) {
				return;
			}

			var container = $( '<div>' ).addClass( 'collabpatrol-m-container' );
			var wrapper = $( '<div>' ).addClass( 'collabpatrol-wrapper' );
			if ( CP.config.compactMode ) {
				wrapper.addClass( 'collabpatrol-wrapper-compact' );
			}
			container.append( wrapper );

			if ( !entry ) {
				if ( !CP.isUnpatrolled() ) {
					return;
				}
				wrapper.append( createBtn( mw.msg( 'collabpatrol-btn-flag' ), 'yellow', function () {
					promptComment( '' ).then( function ( comment ) {
						if ( comment === null ) {
							return;
						}
						CP.api.setStatus( revId, 'pending', comment ).then( renderInterface );
					} );
				}, 'flag' ) );
				target.prepend( container );
				return;
			}

			var elapsed = CP.now() - entry.timestamp * 1000;
			if ( entry.status === 'pending' ) {
				wrapper.addClass( elapsed > CP.config.urgencyThreshold ? 'collabpatrol-wrapper-urgent' : 'collabpatrol-wrapper-pending' );
			} else if ( entry.status === 'in_progress' ) {
				wrapper.addClass( 'collabpatrol-wrapper-progress' );
			} else {
				wrapper.addClass( 'collabpatrol-wrapper-finished' );
			}
			wrapper.append( buildBadge( entry ) );

			if ( entry.status === 'pending' ) {
				wrapper.append( createBtn( mw.msg( 'collabpatrol-btn-take' ), 'green', function () {
					CP.api.setStatus( revId, 'in_progress', entry.comment ).then( renderInterface );
				}, 'userAvatar' ) );
			} else if ( entry.status === 'in_progress' ) {
				wrapper.append( createBtn( mw.msg( 'collabpatrol-btn-finish' ), 'green', function () {
					CP.api.setStatus( revId, 'finished', entry.comment ).then( function () {
						if ( CP.config.notifyFinished ) {
							mw.notify( mw.msg( 'collabpatrol-notify-patrolled' ) );
						}
						renderInterface();
					} );
				}, 'check' ) );
			}

			if ( CP.config.isAdmin || entry.userText === CP.userName ) {
				wrapper.append( createBtn( mw.msg( 'collabpatrol-btn-cancel' ), 'grey', function () {
					if ( !window.confirm( mw.msg( 'collabpatrol-confirm-remove' ) ) ) {
						return;
					}
					CP.api.removeEntry( revId ).then( renderInterface );
				}, 'close' ) );
			}

			if ( CP.config.isAdmin && entry.userText ) {
				wrapper.append( createBtn( mw.msg( 'collabpatrol-btn-ban' ), 'red', function () {
					if ( !window.confirm( mw.msg( 'collabpatrol-confirm-ban' ) + ' ' + entry.userText + ' ?' ) ) {
						return;
					}
					window.open( mw.util.getUrl( 'Special:Block/' + entry.userText ), '_blank' );
				}, 'block' ) );
			}

			if ( CP.config.showHistory && entry.history && entry.history.length > 1 ) {
				wrapper.append( buildHistoryBlock( entry.history ) );
			}

			if ( entry.status !== 'finished' && mw.config.get( 'wgCollabPatrolChatEnabled' ) ) {
				chatRevId = revId;
				container.append( buildChat( revId ) );
			}

			target.prepend( container );
		} );
	}

	mw.hook( 'wikipage.content' ).add( function () {
		if ( CP.getRevId() ) {
			renderInterface();
		}
	} );

}() );

