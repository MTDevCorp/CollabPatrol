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

	function createBtn( label, cls, onClick ) {
		return $( '<button>' )
			.addClass( 'collabpatrol-m-btn collabpatrol-m-btn-' + cls )
			.text( label )
			.on( 'click', onClick );
	}

	function buildChat( revId ) {
		$chatPanel = $( '<div>' ).addClass( 'collabpatrol-m-chat' );

		var $header = $( '<div>' ).addClass( 'collabpatrol-m-chat-header' );
		var $title = $( '<span>' ).addClass( 'collabpatrol-m-chat-title' )
			.text( '💬 ' + mw.msg( 'collabpatrol-chat-title' ) );
		var $count = $( '<span>' ).addClass( 'collabpatrol-m-chat-count' );
		var $toggle = $( '<button>' ).addClass( 'collabpatrol-m-chat-toggle' )
			.text( mw.msg( 'collabpatrol-chat-toggle-open' ) )
			.on( 'click', function () {
				toggleChat();
			} );
		$header.append( $title, $count, $toggle );

		var $body = $( '<div>' ).addClass( 'collabpatrol-m-chat-body' ).hide();
		var $messages = $( '<div>' ).addClass( 'collabpatrol-m-chat-messages' );
		var $composer = buildComposer( revId );
		$body.append( $messages, $composer );

		$chatPanel.append( $header, $body );

		toggleChat( CP.config.chatOpenDefault );
		loadMessages( revId );
		startRefresh( revId );

		return $chatPanel;
	}

	function toggleChat( openState ) {
		if ( typeof openState === 'boolean' ) {
			isOpen = openState;
		} else {
			isOpen = !isOpen;
		}
		var $body = $chatPanel.find( '.collabpatrol-m-chat-body' );
		var $toggle = $chatPanel.find( '.collabpatrol-m-chat-toggle' );
		if ( isOpen ) {
			$body.show();
			$toggle.text( mw.msg( 'collabpatrol-chat-toggle-close' ) );
			loadMessages( chatRevId );
		} else {
			$body.hide();
			$toggle.text( mw.msg( 'collabpatrol-chat-toggle-open' ) );
		}
	}

	function buildComposer( revId ) {
		var $composer = $( '<div>' ).addClass( 'collabpatrol-m-chat-composer' );

		var $input = $( '<textarea>' )
			.addClass( 'collabpatrol-m-chat-input' )
			.attr( 'placeholder', mw.msg( 'collabpatrol-chat-placeholder' ) + ' ' + mw.msg( 'collabpatrol-chat-mention-hint' ) )
			.attr( 'maxlength', MAX_LEN )
			.attr( 'rows', 2 );

		var $counter = $( '<span>' ).addClass( 'collabpatrol-m-chat-counter' ).text( '0/' + MAX_LEN );
		var $error = $( '<div>' ).addClass( 'collabpatrol-m-chat-error' ).hide();
		var $suggestions = $( '<div>' ).addClass( 'collabpatrol-m-chat-mention-suggestions' ).hide();
		var mentionTimer = null;
		var mentionRequestId = 0;
		var activeMention = null;
		var suggestedUsers = [];
		var selectedSuggestion = -1;
		$composer.data( 'cp-input', $input );
		$composer.data( 'cp-send', null );
		$composer.data( 'cp-error', $error );

		var $btn = createBtn( mw.msg( 'collabpatrol-chat-btn-send' ), 'green', function () {
			var msg = $input.val().trim();
			if ( !msg || msg.length > MAX_LEN ) {
				return;
			}
			$btn.prop( 'disabled', true );
			CP.api.chatPost( revId, msg ).then( function ( result ) {
				if ( result && result.result === 'success' ) {
					$input.val( '' );
					$counter.text( '0/' + MAX_LEN );
					loadMessages( revId );
				}
			} ).catch( function ( code, data ) {
				if ( data && data.error && data.error.code === 'chat_user_banned' ) {
					showError( $error, mw.msg( 'collabpatrol-chat-user-banned' ) );
				}
			} ).always( function () {
				$btn.prop( 'disabled', false );
			} );
		} );
		$composer.data( 'cp-send', $btn );

		$input.on( 'input', function () {
			var len = $( this ).val().length;
			$counter.text( len + '/' + MAX_LEN );
			if ( len > MAX_LEN ) {
				$counter.addClass( 'collabpatrol-m-chat-counter-over' );
			} else {
				$counter.removeClass( 'collabpatrol-m-chat-counter-over' );
			}
			scheduleMentionSuggestions();
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
					.addClass( 'collabpatrol-m-chat-mention-suggestion' )
					.toggleClass( 'collabpatrol-m-chat-mention-suggestion-active', index === selectedSuggestion )
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
			$suggestions.children().removeClass( 'collabpatrol-m-chat-mention-suggestion-active' )
				.eq( selectedSuggestion ).addClass( 'collabpatrol-m-chat-mention-suggestion-active' );
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

		$composer.append(
			$input,
			$suggestions,
			$( '<div>' ).addClass( 'collabpatrol-m-chat-composer-row' ).append( $counter, $btn ),
			$error
		);
		return $composer;
	}

	function showError( $el, msg ) {
		$el.text( msg ).show();
	}

	function loadMessages( revId ) {
		CP.api.chatGet( revId ).then( function ( data ) {
			isMod = !!data.isMod;
			isChatBanned = !!data.isBanned;
			bannedUsers = data.bannedUsers || {};
			var messages = data.messages || [];
			updateComposerState();
			updateCount( messages );
			if ( isOpen ) {
				renderMessages( revId, messages );
			}
		} );
	}

	function updateComposerState() {
		if ( !$chatPanel ) {
			return;
		}
		var $composer = $chatPanel.find( '.collabpatrol-m-chat-composer' );
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

	function renderMessages( revId, messages ) {
		var $messages = $chatPanel.find( '.collabpatrol-m-chat-messages' );
		$messages.empty();

		if ( !messages.length ) {
			$messages.append(
				$( '<p>' ).addClass( 'collabpatrol-m-chat-empty' )
					.text( mw.msg( 'collabpatrol-chat-empty' ) )
			);
			return;
		}

		messages.forEach( function ( msg ) {
			$messages.append( buildMessageRow( revId, msg ) );
		} );

		$messages.scrollTop( $messages[ 0 ].scrollHeight );
	}

	function buildMessageRow( revId, msg ) {
		var $row = $( '<div>' ).addClass( 'collabpatrol-m-chat-msg' );

		if ( msg.deleted ) {
			var tombstone = mw.msg( 'collabpatrol-chat-deleted' );
			if ( isMod && msg.deletedBy ) {
				tombstone += ' (' + msg.deletedBy + ')';
			}
			$row.addClass( 'collabpatrol-m-chat-msg-deleted' )
				.append( $( '<em>' ).text( tombstone ) );
			return $row;
		}

		var elapsed = CP.formatTimeElapsed( CP.now() - msg.timestamp * 1000 );

		var userUrl = mw.util.getUrl( 'User:' + msg.userText );
		var $user = $( '<a>' ).attr( 'href', userUrl )
			.addClass( 'collabpatrol-m-chat-user' ).text( msg.userText );
		var $time = $( '<span>' ).addClass( 'collabpatrol-m-chat-time' ).text( ' · ' + elapsed );
		var $meta = $( '<div>' ).addClass( 'collabpatrol-m-chat-meta' ).append( $user, $time );
		var $text = $( '<div>' ).addClass( 'collabpatrol-m-chat-text' ).text( msg.message );

		$row.append( $meta, $text );

		if ( isMod || msg.userText === CP.userName ) {
			var $del = $( '<button>' )
				.addClass( 'collabpatrol-m-chat-btn-delete collabpatrol-m-chat-btn-action' )
				.attr( 'title', mw.msg( 'collabpatrol-chat-btn-delete' ) )
				.text( mw.msg( 'collabpatrol-chat-btn-delete-label' ) )
				.on( 'click', function () {
					if ( !window.confirm( mw.msg( 'collabpatrol-chat-confirm-delete' ) ) ) {
						return;
					}
					CP.api.chatDelete( msg.id ).then( function () {
						loadMessages( revId );
					} );
				} );
			$row.append( $del );
		}
		if ( isMod && msg.userText !== CP.userName ) {
			var isUserBanned = !!bannedUsers[ msg.userText ];
			var $ban = $( '<button>' )
				.addClass( 'collabpatrol-m-chat-btn-delete collabpatrol-m-chat-btn-ban collabpatrol-m-chat-btn-action' )
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
							loadMessages( revId );
						} );
						return;
					}
					confirmed = window.confirm( mw.msg( 'collabpatrol-chat-confirm-ban', msg.userText ) );
					if ( !confirmed ) {
						return;
					}
					CP.api.chatBan( msg.userText, '' ).then( function () {
						mw.notify( mw.msg( 'collabpatrol-chat-ban-success', msg.userText ) );
						loadMessages( revId );
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
		$chatPanel.find( '.collabpatrol-m-chat-count' ).text(
			visible > 0 ? mw.msg( 'collabpatrol-chat-count', visible ) : ''
		);
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

	function renderInterface() {
		var revId = CP.getRevId();
		if ( !revId ) {
			return;
		}

		CP.api.getEntry( revId ).then( function ( entry ) {
			$( '.collabpatrol-m-container' ).remove();
			stopRefresh();
			$chatPanel = null;
			isOpen = false;

			var target = $( '.content, #mw-content-text' ).first();
			if ( !target.length ) {
				return;
			}

			var container = $( '<div>' ).addClass( 'collabpatrol-m-container' );
			if ( CP.config.compactMode ) {
				container.addClass( 'collabpatrol-m-container-compact' );
			}
			var row = $( '<div>' ).addClass( 'collabpatrol-m-row' );

			if ( !entry ) {
				if ( !CP.isUnpatrolled() ) {
					return;
				}
				row.append( createBtn( '⏳ ' + mw.msg( 'collabpatrol-btn-flag' ), 'yellow', function () {
					var comment = window.prompt( mw.msg( 'collabpatrol-comment-placeholder' ), '' );
					if ( comment === null ) {
						return;
					}
					CP.api.setStatus( revId, 'pending', comment ).then( renderInterface );
				} ) );
			} else {
				var elapsed = CP.now() - entry.timestamp * 1000;
				var isUrgent = entry.status === 'pending' && elapsed > CP.config.urgencyThreshold;

				var badgeCls = 'collabpatrol-m-badge ';
				if ( entry.status === 'pending' ) {
					badgeCls += isUrgent ? 'collabpatrol-m-badge-urgent' : 'collabpatrol-m-badge-pending';
				} else if ( entry.status === 'in_progress' ) {
					badgeCls += 'collabpatrol-m-badge-progress';
				} else {
					badgeCls += 'collabpatrol-m-badge-finished';
				}

				var emoji = entry.status === 'pending' ? '⏳' : entry.status === 'in_progress' ? '🔄' : '✅';
				var badgeText = emoji + ' ' + entry.userText;
				if ( entry.comment ) {
					badgeText += ' • ' + entry.comment;
				}

				row.append( $( '<span>' ).addClass( badgeCls ).text( badgeText ) );
				row.append( $( '<span>' ).addClass( 'collabpatrol-m-time' ).text( CP.formatTimeElapsed( elapsed ) ) );
				if ( entry.status !== 'finished' ) {
					row.append(
						$( '<a>' )
							.addClass( 'collabpatrol-m-userdash-link' )
							.attr( 'href', mw.util.getUrl( 'Special:CollabUserDashboard' ) )
							.text( mw.msg( 'collabpatrol-user-dashboard-open' ) )
					);
				}

				if ( entry.status === 'pending' ) {
					row.append( createBtn( mw.msg( 'collabpatrol-btn-take' ), 'green', function () {
						CP.api.setStatus( revId, 'in_progress', entry.comment ).then( renderInterface );
					} ) );
				} else if ( entry.status === 'in_progress' ) {
					row.append( createBtn( mw.msg( 'collabpatrol-btn-finish' ), 'green', function () {
						CP.api.setStatus( revId, 'finished', entry.comment ).then( function () {
							if ( CP.config.notifyFinished ) {
								mw.notify( mw.msg( 'collabpatrol-notify-patrolled' ) );
							}
							renderInterface();
						} );
					} ) );
				}

				if ( CP.config.isAdmin || entry.userText === CP.userName ) {
					row.append( createBtn( '✕', 'grey', function () {
						if ( !window.confirm( mw.msg( 'collabpatrol-confirm-remove' ) ) ) {
							return;
						}
						CP.api.removeEntry( revId ).then( renderInterface );
					} ) );
				}

				container.append( row );

				if ( CP.config.showHistory && entry.history && entry.history.length > 1 ) {
					var histDiv = $( '<div>' ).addClass( 'collabpatrol-m-history' );
					entry.history.forEach( function ( h ) {
						var hElapsed = CP.now() - h.timestamp * 1000;
						var hEmoji = h.action === 'pending' ? '⏳' : h.action === 'in_progress' ? '🔄' : '✅';
						var hText = hEmoji + ' ' + h.userText + ' ' + CP.formatTimeElapsed( hElapsed );
						if ( h.comment ) {
							hText += ' • ' + h.comment;
						}
						histDiv.append( $( '<div>' ).addClass( 'collabpatrol-m-history-item' ).text( hText ) );
					} );
					container.append( histDiv );
				}

				if ( entry.status !== 'finished' && mw.config.get( 'wgCollabPatrolChatEnabled' ) ) {
					chatRevId = revId;
					container.append( buildChat( revId ) );
				}

				target.prepend( container );
				return;
			}

			container.append( row );
			target.prepend( container );
		} );
	}

	mw.hook( 'wikipage.content' ).add( function () {
		if ( CP.getRevId() ) {
			renderInterface();
		}
	} );

}() );
