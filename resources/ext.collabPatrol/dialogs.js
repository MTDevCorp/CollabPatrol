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
	var detailsDialog = null;

	/** Fenêtre étroite (téléphone) : les popups longs passent en plein écran. */
	function isNarrow() {
		return CP.isMobile || window.innerWidth < 640;
	}

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
		var m = getManager();
		var $content = $( '<div>' ).addClass( 'cp-details' ).append(
			CP.w.statusBadge( entry )
		);
		if ( entry.comment ) {
			$content.append( CP.w.commentLine( entry.comment ) );
		}
		if ( CP.config.showHistory && entry.history && entry.history.length > 1 ) {
			$content.append( CP.w.historyToggle( entry.history ) );
		}

		if ( !detailsDialog ) {
			detailsDialog = new OO.ui.MessageDialog();
			m.addWindows( [ detailsDialog ] );
		}
		return m.openWindow( detailsDialog, {
			message: $content,
			size: 'medium',
			actions: [
				{ action: 'close', label: mw.msg( 'collabpatrol-chat-close' ), flags: [ 'primary' ] }
			]
		} ).closed;
	}

	/* ---------------------------------------------------------------------
	 * Popup de discussion
	 * ------------------------------------------------------------------- */

	function ChatDialog( config ) {
		ChatDialog.super.call( this, $.extend( { classes: [ 'cp-chat-dialog' ] }, config ) );
	}
	OO.inheritClass( ChatDialog, OO.ui.ProcessDialog );

	ChatDialog.static.name = 'collabPatrolChat';
	ChatDialog.static.size = 'medium';
	ChatDialog.static.title = mw.msg( 'collabpatrol-chat-title' );
	ChatDialog.static.actions = [
		{ action: 'close', label: mw.msg( 'collabpatrol-chat-close' ), flags: [ 'safe' ] }
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

		var $composer = this.$composer = $( '<div>' ).addClass( 'cp-chat-composer' ).append(
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

		// Mobile : à la fermeture du clavier (sans envoi), le navigateur peut laisser la
		// fenêtre décalée / redimensionnée et la zone de saisie sort de l'écran. On
		// resynchronise donc la mise en page.
		this.onViewportChange = function () {
			dlg.syncViewport();
		};
		this.input.$input.on( 'blur focus', function () {
			setTimeout( dlg.onViewportChange, 50 );
			setTimeout( dlg.onViewportChange, 350 );
			setTimeout( dlg.onViewportChange, 800 );
		} );
	};

	/**
	 * Mobile (plein écran) : cale la fenêtre sur la zone réellement visible. Firefox mobile
	 * (barre d'adresse dynamique, clavier) fausse chacune des mesures prise isolément ;
	 * on retient donc la plus petite hauteur plausible, complétée côté CSS par 100svh.
	 * Ajouter ?cpdebug=1 à l'URL affiche les mesures dans la fenêtre.
	 */
	ChatDialog.prototype.syncViewport = function () {
		var vv = window.visualViewport;
		var heights = [ window.innerHeight, document.documentElement.clientHeight ];
		if ( vv ) {
			heights.push( vv.height );
		}
		var h = Math.round( Math.min.apply( null, heights.filter( function ( n ) {
			return n > 100;
		} ) ) );
		var keyboardOpen = !!vv && ( window.innerHeight - vv.height ) > 120 &&
			this.input.$input.is( ':focus' );
		var top = keyboardOpen ? Math.round( vv.offsetTop ) : 0;

		if ( this.isFull() ) {
			this.$element.addClass( 'cp-fit' ).css( {
				'--cp-vvh': h + 'px',
				'--cp-vvtop': top + 'px'
			} );
			if ( !keyboardOpen && window.pageYOffset !== 0 ) {
				window.scrollTo( 0, 0 );
			}
		}
		this.updateSize();
		this.input.adjustSize( true );
		this.$messages.scrollTop( this.$messages[ 0 ].scrollHeight );

		// Correction empirique : quelle que soit la cause (barre d'adresse, clavier, hauteur
		// de l'en-tête…), si le bas de la zone de saisie dépasse de la zone visible, on
		// remonte le tout exactement du dépassement mesuré.
		var over = 0;
		if ( this.isFull() ) {
			var $layout = this.content.$element.css( 'padding-bottom', '' );
			var visBottom = Math.min( window.innerHeight, vv ? vv.offsetTop + vv.height : Infinity );
			over = Math.ceil( this.$composer[ 0 ].getBoundingClientRect().bottom - visBottom );
			if ( over > 0 ) {
				$layout.css( 'padding-bottom', over + 'px' );
			}
		}

		if ( /[?&]cpdebug=1/.test( location.search ) ) {
			this.$error.text( 'inner=' + window.innerHeight + ' client=' +
				document.documentElement.clientHeight + ' vv=' + ( vv ? Math.round( vv.height ) : '-' ) +
				' vvTop=' + ( vv ? Math.round( vv.offsetTop ) : '-' ) + ' screen=' + screen.height +
				' dpr=' + window.devicePixelRatio + ' h=' + h + ' over=' + over ).show();
		}
	};

	/** La fenêtre est-elle ouverte en plein écran (téléphone) ? */
	ChatDialog.prototype.isFull = function () {
		return !!this.manager && this.manager.$element.hasClass( 'oo-ui-windowManager-size-full' );
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
			if ( window.visualViewport ) {
				window.visualViewport.addEventListener( 'resize', this.onViewportChange );
				window.visualViewport.addEventListener( 'scroll', this.onViewportChange );
			}
			$( window ).on( 'orientationchange', this.onViewportChange );
			this.syncViewport();
			this.input.focus();
		}, this );
	};

	ChatDialog.prototype.getTeardownProcess = function ( data ) {
		return ChatDialog.super.prototype.getTeardownProcess.call( this, data ).first( function () {
			if ( this.stopPoll ) {
				this.stopPoll();
				this.stopPoll = null;
			}
			if ( window.visualViewport ) {
				window.visualViewport.removeEventListener( 'resize', this.onViewportChange );
				window.visualViewport.removeEventListener( 'scroll', this.onViewportChange );
			}
			$( window ).off( 'orientationchange', this.onViewportChange );
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
		return m.openWindow( chatDialog, $.extend( { size: isNarrow() ? 'full' : 'medium' }, data ) ).closed;
	}

	CP.dialogs = {
		promptComment: promptComment,
		showDetails: showDetails,
		openChat: openChat
	};

}() );