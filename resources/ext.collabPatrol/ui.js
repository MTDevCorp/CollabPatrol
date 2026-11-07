/**
 * CollabPatrol — interface sur les diffs / révisions (desktop ET Minerva).
 *
 * - Affichage immédiat depuis wgCollabPatrolInitial (pas d'appel API au chargement).
 * - Les actions utilisent l'entrée renvoyée par le serveur (pas de second appel).
 * - Rafraîchissement périodique silencieux : le DOM n'est refait que si l'état change.
 * - Les modules OOUI lourds (popup de discussion, saisie de commentaire) ne sont
 *   chargés qu'à la demande.
 */
( function () {
	'use strict';

	var CP = window.CollabPatrol;
	var state = { revId: null, entry: null, sig: '', busy: false, started: false, hidden: false };

	function signature( entry ) {
		if ( !entry ) {
			return '';
		}
		return [
			entry.status, entry.userText, entry.timestamp, entry.comment, entry.chatCount,
			entry.history ? entry.history.length : 0,
			// recalcule l'affichage de la durée une fois par minute
			Math.floor( ( CP.now() - entry.timestamp * 1000 ) / 60000 )
		].join( '|' );
	}

	function withDialogs( callback ) {
		mw.loader.using( 'ext.collabPatrol.dialogs' ).then( callback, function () {
			CP.api.fail();
		} );
	}

	function prefetchDialogs() {
		if ( prefetchDialogs.done ) {
			return;
		}
		prefetchDialogs.done = true;
		( mw.requestIdleCallback || function ( fn ) {
			setTimeout( fn, 1500 );
		} )( function () {
			mw.loader.load( 'ext.collabPatrol.dialogs' );
		} );
	}

	/**
	 * Lance une action d'écriture : bouton désactivé pendant l'appel, puis
	 * redessin depuis la réponse du serveur.
	 */
	function act( promise, $btn, after ) {
		state.busy = true;
		if ( $btn ) {
			$btn.prop( 'disabled', true ).addClass( 'cp-btn-busy' );
		}
		promise.then( function ( entry ) {
			state.busy = false;
			state.entry = entry || null;
			state.sig = signature( state.entry );
			if ( after ) {
				after( entry );
			}
			render();
		}, function ( code ) {
			state.busy = false;
			CP.api.fail( code );
			render();
		} );
	}

	function openChat() {
		withDialogs( function () {
			CP.dialogs.openChat( {
				revId: state.revId,
				onCount: function ( count ) {
					if ( state.entry && state.entry.chatCount !== count ) {
						state.entry.chatCount = count;
						state.sig = signature( state.entry );
						render();
					}
				}
			} );
		} );
	}

	function build( entry ) {
		var revId = state.revId;
		// iconOnly : pastille compacte / historique masqué (Minerva)
		var iconOnly = CP.isMobile;
		var $w = $( '<div>' ).addClass( 'collabpatrol-wrapper' + ( CP.isMobile ? ' cp-mobile' : '' ) );

		if ( !entry ) {
			$w.addClass( 'cp-w-none' ).append( CP.w.button( {
				icon: 'flag',
				label: mw.msg( 'collabpatrol-btn-flag' ),
				color: 'flag',
				iconOnly: CP.btnIconOnly( 'flag' ),
				onClick: function ( $btn ) {
					withDialogs( function () {
						CP.dialogs.promptComment( '' ).then( function ( comment ) {
							if ( comment !== null ) {
								act( CP.api.setStatus( revId, 'pending', comment ), $btn );
							}
						} );
					} );
				}
			} ) );
			return $w;
		}

		var elapsed = CP.now() - entry.timestamp * 1000;
		var urgent = entry.status === 'pending' && elapsed > CP.config.urgencyThreshold;
		$w.addClass( 'cp-w-' + CP.getStatusMeta( entry.status, urgent ).cls );

		var $badge = CP.w.statusBadge( entry, { compact: iconOnly } );
		if ( iconOnly ) {
			// Pas de survol au tactile : toucher la pastille ouvre le détail
			$badge.attr( { role: 'button', tabindex: 0 } ).on( 'click keydown', function ( e ) {
				if ( e.type === 'keydown' && e.key !== 'Enter' ) {
					return;
				}
				withDialogs( function () {
					CP.dialogs.showDetails( entry );
				} );
			} );
		}
		$w.append( $badge );

		var $actions = $( '<span>' ).addClass( 'cp-actions' );

		if ( entry.status === 'pending' ) {
 		   $actions.append( CP.w.button( {
  		      icon: 'eye',
   		     label: mw.msg( 'collabpatrol-btn-take' ),
   		     color: 'take',
    		    iconOnly: CP.btnIconOnly( 'main' ),
    		    onClick: function ( $btn ) {
    		        act( CP.api.setStatus( revId, 'in_progress', entry.comment ), $btn );
  		      }
   		    } ) );
		} else if ( entry.status === 'in_progress' ) {
			$actions.append( CP.w.button( {
				icon: 'check',
				label: mw.msg( 'collabpatrol-btn-finish' ),
				color: 'finish',
				iconOnly: CP.btnIconOnly( 'main' ),
				onClick: function ( $btn ) {
					act( CP.api.setStatus( revId, 'finished', entry.comment ), $btn, function () {
						// Diff relue : plus de relecture à demander, l'interface disparaît
						state.hidden = true;
						if ( CP.config.notifyFinished ) {
							mw.notify( mw.msg( 'collabpatrol-notify-patrolled' ) );
						}
					} );
				}
			} ) );
		}

		if ( entry.status !== 'finished' && CP.config.chatEnabled ) {
			var $chat = CP.w.button( {
				icon: 'speechBubbles',
				label: mw.msg( 'collabpatrol-chat-title' ),
				color: 'neutral',
				iconOnly: CP.btnIconOnly( 'chat' ),
				onClick: openChat
			} );
			if ( entry.chatCount > 0 ) {
				$chat.append( $( '<span>' ).addClass( 'cp-badge-count' ).text( entry.chatCount > 99 ? '99+' : entry.chatCount ) );
			}
			$actions.append( $chat );
			prefetchDialogs();
		}

		var hasHistory = CP.config.showHistory && entry.history && entry.history.length > 1;

		if ( CP.config.isAdmin || entry.userText === CP.userName ) {
			$actions.append( CP.w.button( {
				icon: 'close',
				label: mw.msg( 'collabpatrol-btn-cancel' ),
				color: 'cancel',
				iconOnly: CP.btnIconOnly( 'cancel' ),
				onClick: function ( $btn ) {
					if ( window.confirm( mw.msg( 'collabpatrol-confirm-remove' ) ) ) {
						act( CP.api.removeEntry( revId ).then( function () {
							return null;
						} ), $btn );
					}
				}
			} ) );
		}

		$w.append( $actions );

		// Le motif est toujours visible (mobile compris) ; l'historique reste discret
		if ( entry.comment ) {
			$w.append( CP.w.commentLine( entry.comment ) );
		}
		if ( !iconOnly && hasHistory ) {
			$w.append( CP.w.historyToggle( entry.history ) );
		}
		return $w;
	}

	/**
	 * Minerva avec texte sur les boutons : si les boutons ne tiennent plus sur la
	 * même ligne que le titre (statut), ils passent dessous et sont centrés.
	 * La classe est retirée avant de mesurer, sinon le résultat resterait figé.
	 */
	function fitActions() {
		if ( !CP.isMobile || !CP.hasButtonLabels() ) {
			return;
		}
		var $w = $( '.collabpatrol-wrapper' ).first();
		var badge = $w.children( '.cp-status' )[ 0 ];
		var actions = $w.children( '.cp-actions' )[ 0 ];
		if ( !badge || !actions || !$w[ 0 ].offsetWidth ) {
			return;
		}
		$w.removeClass( 'cp-actions-wrapped' );
		var wrapped = actions.getBoundingClientRect().top >= badge.getBoundingClientRect().bottom - 1;
		$w.toggleClass( 'cp-actions-wrapped', wrapped );
	}

	function mount( $w ) {
		var $old = $( '.collabpatrol-wrapper' );
		if ( $old.length ) {
			$old.not( ':first' ).remove();
			$old.first().replaceWith( $w );
			return;
		}
		var $target;
		if ( CP.isMobile ) {
			$target = $( '.content, #mw-content-text' ).first();
			if ( $target.length ) {
				$target.prepend( $w );
			}
			return;
		}
		$target = $( '.mw-diff-ntitle1' ).first();
		if ( $target.length ) {
			$target.append( $w );
			return;
		}
		$target = $( '#contentSub' ).first();
		if ( $target.length ) {
			$target.after( $w );
		}
	}

	function render() {
		if ( state.hidden || ( !state.entry && !CP.isUnpatrolled() ) ) {
			$( '.collabpatrol-wrapper' ).remove();
			return;
		}
		// Un redessin (ex. minuteur) ne doit pas refermer l'historique ouvert
		var historyOpen = $( '.collabpatrol-wrapper .cp-history-wrap' ).prop( 'open' );
		var $w = build( state.entry );
		if ( historyOpen ) {
			$w.find( '.cp-history-wrap' ).prop( 'open', true );
		}
		mount( $w );
		fitActions();
		if ( !render.hashHandled && state.entry && window.location.hash === '#cp-chat' ) {
			render.hashHandled = true;
			if ( state.entry.status !== 'finished' && CP.config.chatEnabled ) {
				openChat();
			}
		}
	}

	function refresh() {
		if ( state.busy ) {
			return;
		}
		CP.api.getEntry( state.revId ).then( function ( entry ) {
			var sig = signature( entry );
			if ( !state.busy && sig !== state.sig ) {
				state.entry = entry;
				state.sig = sig;
				render();
			}
		} );
	}

	function start() {
		if ( state.started ) {
			render();
			return;
		}
		var revId = CP.getRevId();
		if ( !revId ) {
			return;
		}
		state.started = true;
		state.revId = revId;

		var initial = mw.config.get( 'wgCollabPatrolInitial' );
		if ( initial && Number( initial.revId ) === Number( revId ) ) {
			// Données fournies par le serveur : affichage immédiat
			state.entry = initial.entry || null;
			state.sig = signature( state.entry );
			render();
		} else {
			CP.api.getEntry( revId ).then( function ( entry ) {
				state.entry = entry;
				state.sig = signature( entry );
				render();
			} );
		}

		CP.poll( refresh, CP.config.refreshInterval );

		if ( CP.isMobile && CP.hasButtonLabels() ) {
			$( window ).on( 'resize orientationchange', fitActions );
		}
	}

	mw.hook( 'wikipage.content' ).add( start );

}() );

