/**
 * CollabPatrol — fenêtres OOUI (chargées à la demande) :
 *  - popup de discussion
 *  - saisie du commentaire lors d'un signalement
 *  - détail d'une entrée (Minerva)
 */
( function () {
	'use strict';

	var CP = window.CollabPatrol;
	var manager = null;
	var chatDialog = null;
	var promptDialog = null;

	function getManager() {
		if ( !manager ) {
			manager = new OO.ui.WindowManager();
			$( document.body ).append( manager.$element );
		}
		return manager;
	}

	/* ---------------------------------------------------------------------
	 * Commentaire de signalement
	 * ------------------------------------------------------------------- */

	/**
	 * @param {string} initial
	 * @return {jQuery.Promise} Résolue avec le commentaire, ou null si annulé
	 */
	function promptComment( initial ) {
		var deferred = $.Deferred();
		var m = getManager();

		var templates = [ { data: '', label: mw.msg( 'collabpatrol-comment-placeholder' ) } ];
		[ 'verify', 'doubt', 'second-opinion', 'complex', 'vandalism', 'sourcing', 'major', 'sensitive', 'conflict', 'other' ]
			.forEach( function ( key ) {
				var text = mw.msg( 'collabpatrol-template-' + key );
				templates.push( { data: text, label: text } );
			} );

		var select = new OO.ui.DropdownInputWidget( { options: templates, value: '' } );
		var input = new OO.ui.TextInputWidget( {
			value: initial || '',
			maxLength: 200,
			placeholder: mw.msg( 'collabpatrol-comment-placeholder' )
		} );
		select.on( 'change', function ( value ) {
			if ( value ) {
				input.setValue( value );
			}
		} );

		var $content = $( '<div>' ).addClass( 'cp-prompt' ).append( select.$element, input.$element );

		if ( !promptDialog ) {
			promptDialog = new OO.ui.MessageDialog();
			m.addWindows( [ promptDialog ] );
		}

		input.on( 'enter', function () {
			m.closeWindow( promptDialog, { action: 'accept' } );
		} );

		m.openWindow( promptDialog, {
			title: mw.msg( 'collabpatrol-btn-flag' ),
			message: $content,
			size: 'small',
			actions: [
				{ action: 'accept', label: mw.msg( 'collabpatrol-btn-flag' ), flags: [ 'primary', 'progressive' ] },
				{ action: 'reject', label: mw.msg( 'cancel' ), flags: 'safe' }
			]
		} ).closed.then( function ( data ) {
			deferred.resolve( data && data.action === 'accept' ? input.getValue().trim() : null );
		} );
		setTimeout( function () {
			input.focus();
		}, 250 );

		return deferred.promise();
	}

	/* ---------------------------------------------------------------------
	 * Détail d'une entrée (Minerva : statut, commentaire, historique)
	 * ------------------------------------------------------------------- */

	function showDetails( entry ) {
		var $content = $( '<div>' ).addClass( 'cp-details' ).append(
			CP.w.statusBadge( entry, { showComment: true } )
		);
		if ( CP.config.showHistory && entry.history && entry.history.length > 1 ) {
			$content.append( CP.w.historyBlock( entry.history ) );
		}
		return OO.ui.alert( $content, { size: 'medium' } );
	}

	/* ---------------------------------------------------------------------
	 * Popup de discussion
	 * ------------------------------------------------------------------- */

	function ChatDialog( config ) {
		ChatDialog.super.call( this, config );
	}
	OO.inheritClass( ChatDialog, OO.ui.ProcessDialog );

	ChatDialog.static.name = 'collabPatrolChat';
	ChatDialog.static.size = 'medium';
	ChatDialog.static.title = mw.msg( 'collabpatrol-chat-title' );
	ChatDialog.static.actions = [
		{ action: 'close', label: mw.msg( 'collabpatrol-chat-close' ), flags: [ 'safe', 'close' ] }
	];

	ChatDialog.prototype.getBodyHeight = function () {
		return Math.min( 480, Math.max( 320, Math.floor( window.innerHeight * 0.7 ) ) );
	};

	ChatDialog.prototype.initialize = function () {
		var dlg = this;
		ChatDialog.super.prototype.initialize.call( this );

		this.$messages = $( '<div>' ).addClass( 'cp-chat-messages' ).attr( { role: 'log', 'aria-live': 'polite' } );
		this.$error = $( '<div>' ).addClass( 'cp-chat-error' ).hide();

		this.input = new OO.ui.MultilineTextInputWidget( {
			rows: 2,
			autosize: true,
			maxRows: 4,
			classes: [ 'cp-chat-input' ],
			placeholder: mw.msg( 'collabpatrol-chat-placeholder' )
		} );
		this.counter = $( '<span>' ).addClass( 'cp-chat-char-counter' );
		this.sendBtn = new OO.ui.ButtonWidget( {
			label: mw.msg( 'collabpatrol-chat-btn-send' ),
			icon: 'speechBubble',
			flags: [ 'primary', 'progressive' ]
		} );

		var $composer = $( '<div>' ).addClass( 'cp-chat-composer' ).append(
			this.input.$element,
			$( '<div>' ).addClass( 'cp-chat-composer-row' ).append( this.counter, this.sendBtn.$element )
		);

		this.content = new OO.ui.PanelLayout( { expanded: true, padded: false } );
		this.content.$element.addClass( 'cp-chat-layout' ).append( this.$messages, this.$error, $composer );
		this.$body.append( this.content.$element );

		this.input.on( 'change', function () {
			var len = dlg.input.getValue().length;
			dlg.counter.text( len + ' / ' + CP.config.chatMaxLength )
				.toggleClass( 'cp-chat-char-counter-over', len > CP.config.chatMaxLength );
		} );
		this.input.$input.on( 'keydown', function ( e ) {
			if ( e.key === 'Enter' && ( e.ctrlKey || e.metaKey ) ) {
				e.preventDefault();
				dlg.send();
			}
		} );
		this.sendBtn.on( 'click', function () {
			dlg.send();
		} );
		CP.mentions.attachAutocomplete( this.input.$input );
	};

	ChatDialog.prototype.getSetupProcess = function ( data ) {
		return ChatDialog.super.prototype.getSetupProcess.call( this, data ).next( function () {
			this.revId = data.revId;
			this.onCount = data.onCount;
			this.isMod = false;
			this.lastId = 0;
			this.loading = false;
			this.messages = {};
			this.rows = {};
			this.$messages.empty();
			this.$error.hide();
			this.input.setValue( '' );
			this.counter.text( '' );
			this.showEmpty( true );
			this.load();
		}, this );
	};

	ChatDialog.prototype.getReadyProcess = function ( data ) {
		return ChatDialog.super.prototype.getReadyProcess.call( this, data ).next( function () {
			var interval = CP.config.refreshInterval ? Math.min( CP.config.refreshInterval, 15000 ) : 0;
			this.stopPoll = CP.poll( this.load.bind( this ), interval );
			this.input.focus();
		}, this );
	};

	ChatDialog.prototype.getTeardownProcess = function ( data ) {
		return ChatDialog.super.prototype.getTeardownProcess.call( this, data ).first( function () {
			if ( this.stopPoll ) {
				this.stopPoll();
				this.stopPoll = null;
			}
		}, this );
	};

	ChatDialog.prototype.getActionProcess = function ( action ) {
		if ( action === 'close' ) {
			return new OO.ui.Process( function () {
				this.close( { action: 'close' } );
			}, this );
		}
		return ChatDialog.super.prototype.getActionProcess.call( this, action );
	};

	ChatDialog.prototype.showEmpty = function ( show ) {
		this.$messages.children( '.cp-chat-empty' ).remove();
		if ( show ) {
			this.$messages.append( $( '<p>' ).addClass( 'cp-chat-empty' ).text( mw.msg( 'collabpatrol-chat-empty' ) ) );
		}
	};

	ChatDialog.prototype.showError = function ( code ) {
		var key = {
			blocked: 'collabpatrol-error-blocked',
			banned_word: 'collabpatrol-chat-banned-word',
			message_too_long: 'collabpatrol-chat-too-long'
		}[ code ] || 'collabpatrol-chat-send-error';
		var $error = this.$error;
		$error.text( mw.msg( key ) ).show();
		clearTimeout( this.errorTimer );
		this.errorTimer = setTimeout( function () {
			$error.hide();
		}, 7000 );
	};

	/** Charge uniquement les nouveaux messages (incrémental). */
	ChatDialog.prototype.load = function () {
		var dlg = this;
		if ( dlg.loading ) {
			return;
		}
		dlg.loading = true;
		CP.api.chatGet( dlg.revId, dlg.lastId ).then( function ( data ) {
			dlg.loading = false;
			dlg.merge( data );
		}, function ( code ) {
			dlg.loading = false;
			dlg.showError( code );
		} );
	};

	ChatDialog.prototype.merge = function ( data ) {
		var dlg = this;
		var el = this.$messages[ 0 ];
		var stick = dlg.lastId === 0 || el.scrollHeight - el.scrollTop - el.clientHeight < 40;

		dlg.isMod = !!data.isMod;

		( data.deleted || [] ).forEach( function ( id ) {
			var msg = dlg.messages[ id ];
			if ( msg && !msg.deleted ) {
				msg.deleted = true;
				dlg.replaceRow( msg );
			}
		} );

		( data.messages || [] ).forEach( function ( msg ) {
			if ( dlg.messages[ msg.id ] ) {
				return;
			}
			dlg.showEmpty( false );
			dlg.messages[ msg.id ] = msg;
			dlg.rows[ msg.id ] = dlg.buildRow( msg );
			dlg.$messages.append( dlg.rows[ msg.id ] );
		} );

		dlg.lastId = Math.max( dlg.lastId, data.lastId || 0 );
		if ( !Object.keys( dlg.messages ).length ) {
			dlg.showEmpty( true );
		}
		if ( stick ) {
			el.scrollTop = el.scrollHeight;
		}
		if ( dlg.onCount && typeof data.count === 'number' ) {
			dlg.onCount( data.count );
		}
	};

	ChatDialog.prototype.replaceRow = function ( msg ) {
		var $new = this.buildRow( msg );
		this.rows[ msg.id ].replaceWith( $new );
		this.rows[ msg.id ] = $new;
	};

	ChatDialog.prototype.buildRow = function ( msg ) {
		var dlg = this;
		var $row = $( '<div>' ).addClass( 'cp-chat-msg' ).attr( 'data-id', msg.id );

		if ( msg.deleted ) {
			return $row.addClass( 'cp-chat-msg-deleted' ).text( mw.msg( 'collabpatrol-chat-deleted' ) );
		}

		var $meta = $( '<div>' ).addClass( 'cp-chat-msg-meta' ).append(
			$( '<a>' ).addClass( 'cp-chat-msg-user' )
				.attr( 'href', mw.util.getUrl( 'User:' + msg.userText ) ).text( msg.userText ),
			$( '<span>' ).addClass( 'cp-chat-msg-time' )
				.text( ' • ' + CP.formatTimeElapsed( CP.now() - msg.timestamp * 1000 ) )
		);
		var $text = $( '<div>' ).addClass( 'cp-chat-msg-text' );
		if ( CP.mentions.renderText( $text, msg.message, msg.mentions ) ) {
			$row.addClass( 'cp-chat-msg-mentioned' );
		}
		$row.append( $meta, $text );

		if ( dlg.isMod || msg.userText === CP.userName ) {
			$row.append(
				$( '<button>' ).attr( { type: 'button', title: mw.msg( 'collabpatrol-chat-btn-delete' ),
					'aria-label': mw.msg( 'collabpatrol-chat-btn-delete' ) } )
					.addClass( 'cp-chat-btn-delete' )
					.append( CP.w.icon( 'trash' ) )
					.on( 'click', function () {
						if ( !window.confirm( mw.msg( 'collabpatrol-chat-confirm-delete' ) ) ) {
							return;
						}
						CP.api.chatDelete( msg.id ).then( function () {
							msg.deleted = true;
							dlg.replaceRow( msg );
						}, function ( code ) {
							dlg.showError( code );
						} );
					} )
			);
		}
		return $row;
	};

	ChatDialog.prototype.send = function () {
		var dlg = this;
		var text = dlg.input.getValue().trim();
		if ( !text || text.length > CP.config.chatMaxLength || dlg.sendBtn.isDisabled() ) {
			return;
		}
		dlg.sendBtn.setDisabled( true );
		CP.api.chatPost( dlg.revId, text ).then( function () {
			dlg.sendBtn.setDisabled( false );
			dlg.input.setValue( '' );
			dlg.load();
		}, function ( code ) {
			dlg.sendBtn.setDisabled( false );
			dlg.showError( code );
		} );
	};

	function openChat( data ) {
		var m = getManager();
		if ( !chatDialog ) {
			chatDialog = new ChatDialog();
			m.addWindows( [ chatDialog ] );
		}
		return m.openWindow( chatDialog, data ).closed;
	}

	CP.dialogs = {
		promptComment: promptComment,
		showDetails: showDetails,
		openChat: openChat
	};

}() );
