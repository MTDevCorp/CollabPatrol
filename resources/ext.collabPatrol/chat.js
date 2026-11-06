( function () {
	'use strict';

	if ( !mw.config.get( 'wgCollabPatrolChatEnabled' ) ) {
		return;
	}

	var CP = window.CollabPatrol;
	var skin = mw.config.get( 'skin' );

	if ( skin === 'minerva' ) {
		return;
	}

	var MAX_LEN = mw.config.get( 'wgCollabPatrolChatMaxLength' ) || 500;
	var currentRevId = null;
	var isMod = false;
	var isChatBanned = false;
	var bannedUsers = {};
	var refreshTimer = null;
	var $chatPanel = null;
	var isOpen = false;


	var toggleButton = null;

	function buildPanel() {
		var panel = new OO.ui.PanelLayout( { expanded: false, framed: false, classes: [ 'cp-chat-panel' ] } );
		$chatPanel = panel.$element.attr( 'id', 'cp-chat' ).hide();

		var $header = $( '<div>' ).addClass( 'cp-chat-header' );
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
			togglePanel();
		} );
		$header.append( $title, $count, toggleButton.$element );

		var $body = $( '<div>' ).addClass( 'cp-chat-body' ).hide();
		var $messages = $( '<div>' ).addClass( 'cp-chat-messages' );
		var $composer = buildComposer();
		$body.append( $messages, $composer );

		$chatPanel.append( $header, $body );

		mw.hook( 'collabpatrol.entryActive' ).add( function ( revId ) {
			currentRevId = revId;
			attachPanel();
			loadMessages();
			startRefresh();
		} );

		mw.hook( 'collabpatrol.entryFinished' ).add( function () {
			currentRevId = null;
			stopRefresh();
			if ( $chatPanel ) {
				$chatPanel.hide();
			}
		} );

		var existingRevId = CP.getRevId();
		if ( existingRevId ) {
			CP.api.getEntry( existingRevId ).then( function ( entry ) {
				if ( entry && entry.status !== 'finished' ) {
					currentRevId = existingRevId;
					attachPanel();
					loadMessages();
					startRefresh();
				}
			} );
		}
	}

	function attachPanel() {
		if ( !$chatPanel ) {
			return;
		}
		$chatPanel.detach();

		var $wrapper = $( '.collabpatrol-wrapper' ).last();
		if ( $wrapper.length ) {
			$wrapper.after( $chatPanel );
		} else {
			var $target = $( '.mw-diff-ntitle1' ).first();
			if ( $target.length ) {
				$target.append( $chatPanel );
			} else {
				// Repli (pas de bloc de diff) : sous #contentSub, comme le wrapper de ui.js
				var $sub = $( '#contentSub' ).first();
				if ( !$sub.length ) {
					return;
				}
				$sub.after( $chatPanel );
			}
		}
		$chatPanel.show();
		var openNow = isOpen || CP.config.chatOpenDefault || window.location.hash === '#cp-chat';
		setOpenState( openNow );
		if ( openNow ) {
			loadMessages();
		}
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

	function togglePanel() {
		setOpenState( !isOpen );
		if ( isOpen ) {
			loadMessages();
		}
	}

	function buildComposer() {
		var $composer = $( '<div>' ).addClass( 'cp-chat-composer' );
		var inputWidget = new OO.ui.MultilineTextInputWidget( {
			placeholder: mw.msg( 'collabpatrol-chat-placeholder' ),
			maxLength: MAX_LEN,
			rows: 2,
			autosize: true,
			maxRows: 6,
			classes: [ 'cp-chat-input' ]
		} );
		var $input = inputWidget.$input;
		var $counter = $( '<span>' ).addClass( 'cp-chat-char-counter' ).text( '0/' + MAX_LEN );
		var sendButton = new OO.ui.ButtonWidget( {
			label: mw.msg( 'collabpatrol-chat-btn-send' ),
			icon: 'speechBubble',
			flags: [ 'primary', 'progressive' ],
			framed: true,
			classes: [ 'cp-chat-send' ]
		} );
		var $error = $( '<div>' ).addClass( 'cp-chat-error' ).hide();
		$composer.data( 'cp-input', inputWidget );
		$composer.data( 'cp-send', sendButton );
		$composer.data( 'cp-error', $error );

		$input.on( 'input', function () {
			var len = $( this ).val().length;
			$counter.text( len + '/' + MAX_LEN );
			$counter.toggleClass( 'cp-chat-char-counter-over', len > MAX_LEN );
		} );

		function send() {
			if ( !currentRevId || sendButton.isDisabled() ) {
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
			CP.api.chatPost( currentRevId, msg ).then( function ( result ) {
				if ( result && result.result === 'success' ) {
					inputWidget.setValue( '' );
					$counter.text( '0/' + MAX_LEN );
					loadMessages();
				} else {
					showError( $error, mw.msg( 'collabpatrol-chat-send-error' ) );
				}
			} ).catch( function ( code, data ) {
				var errMsg = mw.msg( 'collabpatrol-chat-send-error' );
				if ( data && data.error && data.error.code === 'banned_word' ) {
					errMsg = mw.msg( 'collabpatrol-chat-banned-word' );
				} else if ( data && data.error && data.error.code === 'message_too_long' ) {
					errMsg = mw.msg( 'collabpatrol-chat-too-long' );
				} else if ( data && data.error && data.error.code === 'chat_user_banned' ) {
					errMsg = mw.msg( 'collabpatrol-chat-user-banned' );
				}
				showError( $error, errMsg );
			} ).always( function () {
				sendButton.setDisabled( isChatBanned );
			} );
		}

		sendButton.on( 'click', send );

		$input.on( 'keydown', function ( e ) {
			if ( ( e.ctrlKey || e.metaKey ) && e.key === 'Enter' ) {
				send();
			}
		} );

		$composer.append(
			inputWidget.$element,
			$( '<div>' ).addClass( 'cp-chat-composer-row' ).append( $counter, sendButton.$element ),
			$error
		);
		CP.mentions.attachAutocomplete( $input, inputWidget.$element );
		return $composer;
	}

	function showError( $el, msg ) {
		$el.empty().append( new OO.ui.MessageWidget( { type: 'error', label: msg } ).$element ).show();
		setTimeout( function () {
			$el.fadeOut();
		}, 4000 );
	}


	function loadMessages() {
		if ( !currentRevId ) {
			return;
		}
		CP.api.chatGet( currentRevId ).then( function ( data ) {
			isMod = !!data.isMod;
			isChatBanned = !!data.isBanned;
			bannedUsers = data.bannedUsers || {};
			var messages = data.messages || [];
			updateComposerState();
			renderMessages( messages );
			updateCount( messages );
		} );
	}

	function updateComposerState() {
		var $composer = $chatPanel.find( '.cp-chat-composer' );
		var input = $composer.data( 'cp-input' );
		var btn = $composer.data( 'cp-send' );
		var $error = $composer.data( 'cp-error' );
		if ( !input || !btn || !$error ) {
			return;
		}
		input.setDisabled( isChatBanned );
		btn.setDisabled( isChatBanned );
		if ( isChatBanned ) {
			showError( $error, mw.msg( 'collabpatrol-chat-user-banned' ) );
		} else {
			$error.hide();
		}
	}

	function renderMessages( messages ) {
		var $messages = $chatPanel.find( '.cp-chat-messages' );
		$messages.empty();

		if ( !messages.length ) {
			$messages.append( $( '<p>' ).addClass( 'cp-chat-empty' ).text( mw.msg( 'collabpatrol-chat-empty' ) ) );
			return;
		}

		messages.forEach( function ( msg ) {
			$messages.append( buildMessageRow( msg ) );
		} );

		$messages.scrollTop( $messages[ 0 ].scrollHeight );
	}

	function buildMessageRow( msg ) {
		var $row = $( '<div>' ).addClass( 'cp-chat-msg' ).attr( 'data-msg-id', msg.id );

		if ( msg.deleted ) {
			$row.addClass( 'cp-chat-msg-deleted' );
			var tombstone = mw.msg( 'collabpatrol-chat-deleted' );
			if ( isMod && msg.deletedBy ) {
				tombstone += ' (' + msg.deletedBy + ')';
			}
			$row.append( $( '<em>' ).text( tombstone ) );
			return $row;
		}

		var elapsed = CP.formatTimeElapsed( CP.now() - msg.timestamp * 1000 );
		var $meta = $( '<span>' ).addClass( 'cp-chat-msg-meta' );

		var userUrl = mw.util.getUrl( 'User:' + msg.userText );
		var $userLink = $( '<a>' ).attr( 'href', userUrl ).addClass( 'cp-chat-msg-user' ).text( msg.userText );
		var $time = $( '<span>' ).addClass( 'cp-chat-msg-time' ).text( elapsed );
		$meta.append( $userLink, ' · ', $time );

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
					loadMessages();
				} );
			} );
			$row.append( delBtn.$element );
		}
		if ( isMod && msg.userText !== CP.userName ) {
			var isUserBanned = !!bannedUsers[ msg.userText ];
			var banBtn = new OO.ui.ButtonWidget( {
				icon: isUserBanned ? 'undo' : 'block',
				title: isUserBanned ? mw.msg( 'collabpatrol-chat-btn-unban' ) : mw.msg( 'collabpatrol-chat-btn-ban' ),
				framed: false,
				flags: [ isUserBanned ? 'progressive' : 'destructive' ],
				classes: [ 'cp-chat-btn-delete', 'cp-chat-btn-ban' ]
			} );
			banBtn.on( 'click', function () {
				if ( isUserBanned ) {
					if ( !window.confirm( mw.msg( 'collabpatrol-chat-confirm-unban', msg.userText ) ) ) {
						return;
					}
					CP.api.chatUnban( msg.userText ).then( function () {
						mw.notify( mw.msg( 'collabpatrol-chat-unban-success', msg.userText ) );
						loadMessages();
					} );
					return;
				}
				if ( !window.confirm( mw.msg( 'collabpatrol-chat-confirm-ban', msg.userText ) ) ) {
					return;
				}
				CP.api.chatBan( msg.userText, '' ).then( function () {
					mw.notify( mw.msg( 'collabpatrol-chat-ban-success', msg.userText ) );
					loadMessages();
				} );
			} );
			$row.append( banBtn.$element );
		}

		return $row;
	}

	function updateCount( messages ) {
		var visible = messages.filter( function ( m ) {
			return !m.deleted;
		} ).length;
		$chatPanel.find( '.cp-chat-count' ).text(
			visible > 0 ? mw.msg( 'collabpatrol-chat-count', visible ) : ''
		);
	}


	function startRefresh() {
		stopRefresh();
		if ( CP.config.refreshInterval <= 0 ) {
			return;
		}
		refreshTimer = setInterval( function () {
			if ( isOpen ) {
				loadMessages();
			}
		}, CP.config.refreshInterval );
	}

	function stopRefresh() {
		if ( refreshTimer ) {
			clearInterval( refreshTimer );
			refreshTimer = null;
		}
	}


	mw.hook( 'wikipage.content' ).add( function () {
		if ( !CP.getRevId() ) {
			return;
		}
		if ( !$chatPanel ) {
			buildPanel();
		}
	} );

}() );





