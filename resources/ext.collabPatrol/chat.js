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


	function buildPanel() {
		$chatPanel = $( '<div>' ).addClass( 'cp-chat-panel' ).hide();

		var $header = $( '<div>' ).addClass( 'cp-chat-header' );
		var $title = $( '<span>' ).addClass( 'cp-chat-title' ).text( '💬 ' + mw.msg( 'collabpatrol-chat-title' ) );
		var $count = $( '<span>' ).addClass( 'cp-chat-count' );
		var $toggle = $( '<button>' ).addClass( 'cp-chat-toggle' ).text( mw.msg( 'collabpatrol-chat-toggle-open' ) );
		$toggle.on( 'click', function () {
			togglePanel();
		} );
		$header.append( $title, $count, $toggle );

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
		$chatPanel.detach();

		var $wrapper = $( '.collabpatrol-wrapper' ).last();
		if ( $wrapper.length ) {
			$wrapper.after( $chatPanel );
		} else {
			var $target = $( '.mw-diff-ntitle1' ).first();
			if ( $target.length ) {
				$target.append( $chatPanel );
			}
		}
		$chatPanel.show();
		setOpenState( CP.config.chatOpenDefault );
		if ( CP.config.chatOpenDefault ) {
			loadMessages();
		}
	}

	function setOpenState( open ) {
		isOpen = !!open;
		var $body = $chatPanel.find( '.cp-chat-body' );
		var $toggle = $chatPanel.find( '.cp-chat-toggle' );
		if ( isOpen ) {
			$body.show();
			$toggle.text( mw.msg( 'collabpatrol-chat-toggle-close' ) );
		} else {
			$body.hide();
			$toggle.text( mw.msg( 'collabpatrol-chat-toggle-open' ) );
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
		var $input = $( '<textarea>' )
			.addClass( 'cp-chat-input' )
			.attr( 'placeholder', mw.msg( 'collabpatrol-chat-placeholder' ) + ' ' + mw.msg( 'collabpatrol-chat-mention-hint' ) )
			.attr( 'maxlength', MAX_LEN )
			.attr( 'rows', 2 );
		var $counter = $( '<span>' ).addClass( 'cp-chat-char-counter' ).text( '0/' + MAX_LEN );
		var $btn = $( '<button>' )
			.addClass( 'collabpatrol-btn collabpatrol-btn-green cp-chat-send' )
			.text( mw.msg( 'collabpatrol-chat-btn-send' ) );
		var $error = $( '<div>' ).addClass( 'cp-chat-error' ).hide();
		var $suggestions = $( '<div>' ).addClass( 'cp-chat-mention-suggestions' ).hide();
		var mentionTimer = null;
		var mentionRequestId = 0;
		var activeMention = null;
		var suggestedUsers = [];
		var selectedSuggestion = -1;
		$composer.data( 'cp-input', $input );
		$composer.data( 'cp-send', $btn );
		$composer.data( 'cp-error', $error );

		$input.on( 'input', function () {
			var len = $( this ).val().length;
			$counter.text( len + '/' + MAX_LEN );
			if ( len > MAX_LEN ) {
				$counter.addClass( 'cp-chat-char-counter-over' );
			} else {
				$counter.removeClass( 'cp-chat-char-counter-over' );
			}
			scheduleMentionSuggestions();
		} );

		$btn.on( 'click', function () {
			if ( !currentRevId ) {
				return;
			}
			var msg = $input.val().trim();
			if ( !msg ) {
				return;
			}
			if ( msg.length > MAX_LEN ) {
				showError( $error, mw.msg( 'collabpatrol-chat-too-long' ) );
				return;
			}
			$btn.prop( 'disabled', true );
			$error.hide();
			CP.api.chatPost( currentRevId, msg ).then( function ( result ) {
				if ( result && result.result === 'success' ) {
					$input.val( '' );
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
				$btn.prop( 'disabled', false );
			} );
		} );

		$input.on( 'keydown', function ( e ) {
			if ( $suggestions.is( ':visible' ) ) {
				if ( e.key === 'ArrowDown' ) {
					e.preventDefault();
					selectMentionSuggestion( selectedSuggestion + 1 );
					return;
				}
				if ( e.key === 'ArrowUp' ) {
					e.preventDefault();
					selectMentionSuggestion( selectedSuggestion - 1 );
					return;
				}
				if ( e.key === 'Enter' || e.key === 'Tab' ) {
					e.preventDefault();
					applyMentionSuggestion( selectedSuggestion < 0 ? 0 : selectedSuggestion );
					return;
				}
				if ( e.key === 'Escape' ) {
					hideMentionSuggestions();
					return;
				}
			}
			if ( ( e.ctrlKey || e.metaKey ) && e.key === 'Enter' ) {
				$btn.trigger( 'click' );
			}
		} );

		$input.on( 'click keyup', function ( e ) {
			if ( e.type === 'keyup' && [ 'ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape' ].indexOf( e.key ) !== -1 ) {
				return;
			}
			scheduleMentionSuggestions();
		} );

		$input.on( 'blur', function () {
			setTimeout( hideMentionSuggestions, 150 );
		} );

		function scheduleMentionSuggestions() {
			clearTimeout( mentionTimer );
			mentionTimer = setTimeout( updateMentionSuggestions, 120 );
		}

		function updateMentionSuggestions() {
			activeMention = getActiveMention();
			if ( !activeMention ) {
				hideMentionSuggestions();
				return;
			}

			var requestId = ++mentionRequestId;
			CP.api.searchUsers( activeMention.prefix.replace( /_/g, ' ' ) ).then( function ( users ) {
				if ( requestId !== mentionRequestId ) {
					return;
				}
				if ( !getActiveMention() ) {
					hideMentionSuggestions();
					return;
				}
				renderMentionSuggestions( users );
			} ).catch( hideMentionSuggestions );
		}

		function getActiveMention() {
			var el = $input[ 0 ];
			var cursor = el.selectionStart;
			var beforeCursor = $input.val().slice( 0, cursor );
			var match = /(^|[\s([{<])@([^\s@:,;!?.)\]\}<>]{0,85})$/u.exec( beforeCursor );
			if ( !match ) {
				return null;
			}
			return {
				start: cursor - match[ 2 ].length - 1,
				end: cursor,
				prefix: match[ 2 ]
			};
		}

		function renderMentionSuggestions( users ) {
			suggestedUsers = users || [];
			$suggestions.empty();
			selectedSuggestion = suggestedUsers.length ? 0 : -1;

			if ( !suggestedUsers.length ) {
				hideMentionSuggestions();
				return;
			}

			suggestedUsers.forEach( function ( user, index ) {
				var $item = $( '<button>' )
					.attr( 'type', 'button' )
					.addClass( 'cp-chat-mention-suggestion' )
					.toggleClass( 'cp-chat-mention-suggestion-active', index === selectedSuggestion )
					.text( user.name )
					.on( 'mousedown', function ( e ) {
						e.preventDefault();
						applyMentionSuggestion( index );
					} );
				$suggestions.append( $item );
			} );
			$suggestions.show();
		}

		function selectMentionSuggestion( index ) {
			if ( !suggestedUsers.length ) {
				return;
			}
			selectedSuggestion = ( index + suggestedUsers.length ) % suggestedUsers.length;
			$suggestions.children().removeClass( 'cp-chat-mention-suggestion-active' )
				.eq( selectedSuggestion ).addClass( 'cp-chat-mention-suggestion-active' );
		}

		function applyMentionSuggestion( index ) {
			var user = suggestedUsers[ index ];
			activeMention = getActiveMention();
			if ( !user || !activeMention ) {
				return;
			}
			var mentionText = '@' + user.name.replace( /\s+/g, '_' ) + ' ';
			var value = $input.val();
			var nextValue = value.slice( 0, activeMention.start ) + mentionText + value.slice( activeMention.end );
			var cursor = activeMention.start + mentionText.length;
			$input.val( nextValue );
			$input[ 0 ].setSelectionRange( cursor, cursor );
			$input.trigger( 'input' );
			hideMentionSuggestions();
		}

		function hideMentionSuggestions() {
			suggestedUsers = [];
			selectedSuggestion = -1;
			$suggestions.hide().empty();
		}

		$composer.append( $input, $suggestions, $( '<div>' ).addClass( 'cp-chat-composer-row' ).append( $counter, $btn ), $error );
		return $composer;
	}

	function showError( $el, msg ) {
		$el.text( msg ).show();
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
		var $input = $composer.data( 'cp-input' );
		var $btn = $composer.data( 'cp-send' );
		var $error = $composer.data( 'cp-error' );
		if ( !$input || !$btn || !$error ) {
			return;
		}
		if ( isChatBanned ) {
			$input.prop( 'disabled', true );
			$btn.prop( 'disabled', true );
			showError( $error, mw.msg( 'collabpatrol-chat-user-banned' ) );
		} else {
			$input.prop( 'disabled', false );
			$btn.prop( 'disabled', false );
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

		var $text = $( '<span>' ).addClass( 'cp-chat-msg-text' ).text( msg.message );

		$row.append( $meta, $text );

		if ( isMod || msg.userText === CP.userName ) {
			var $del = $( '<button>' )
				.addClass( 'cp-chat-btn-delete cp-chat-btn-action' )
				.attr( 'title', mw.msg( 'collabpatrol-chat-btn-delete' ) )
				.text( mw.msg( 'collabpatrol-chat-btn-delete-label' ) )
				.on( 'click', function () {
					if ( !window.confirm( mw.msg( 'collabpatrol-chat-confirm-delete' ) ) ) {
						return;
					}
					CP.api.chatDelete( msg.id ).then( function () {
						loadMessages();
					} );
				} );
			$row.append( $del );
		}
		if ( isMod && msg.userText !== CP.userName ) {
			var isUserBanned = !!bannedUsers[ msg.userText ];
			var $ban = $( '<button>' )
				.addClass( 'cp-chat-btn-delete cp-chat-btn-ban cp-chat-btn-action' )
				.attr( 'title', isUserBanned ? mw.msg( 'collabpatrol-chat-btn-unban' ) : mw.msg( 'collabpatrol-chat-btn-ban' ) )
				.text( isUserBanned ? mw.msg( 'collabpatrol-chat-btn-unban-label' ) : mw.msg( 'collabpatrol-chat-btn-ban-label' ) )
				.on( 'click', function () {
					var confirmed;
					if ( isUserBanned ) {
						confirmed = window.confirm( mw.msg( 'collabpatrol-chat-confirm-unban', msg.userText ) );
						if ( !confirmed ) {
							return;
						}
						CP.api.chatUnban( msg.userText ).then( function () {
							mw.notify( mw.msg( 'collabpatrol-chat-unban-success', msg.userText ) );
							loadMessages();
						} );
						return;
					}
					confirmed = window.confirm( mw.msg( 'collabpatrol-chat-confirm-ban', msg.userText ) );
					if ( !confirmed ) {
						return;
					}
					CP.api.chatBan( msg.userText, '' ).then( function () {
						mw.notify( mw.msg( 'collabpatrol-chat-ban-success', msg.userText ) );
						loadMessages();
					} );
				} );
			$row.append( $ban );
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
