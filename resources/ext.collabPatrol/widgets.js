/**
 * CollabPatrol — composants d'interface partagés (diff, tableau de bord).
 *
 * Volontairement sans OOUI JS : seuls les *icônes* OOUI (classes CSS) sont
 * utilisées. Les boutons et pastilles sont de simples éléments natifs, beaucoup
 * plus rapides à construire que des widgets OOUI.
 */
( function () {
	'use strict';

	var CP = window.CollabPatrol;

	/**
	 * Icône OOUI (via sa classe CSS).
	 *
	 * @param {string} name
	 * @return {jQuery}
	 */
	function icon( name ) {
		return $( '<span>' ).addClass( 'cp-ico oo-ui-icon-' + name ).attr( 'aria-hidden', 'true' );
	}

	/**
	 * Bouton compact. En mode « icône seule » le libellé reste disponible pour
	 * les lecteurs d'écran et l'infobulle.
	 *
	 * @param {Object} o
	 * @param {string} o.icon Nom de l'icône OOUI
	 * @param {string} o.label
	 * @param {string} [o.color] flag | take | finish | cancel | neutral
	 * @param {boolean} [o.iconOnly]
	 * @param {Function} o.onClick
	 * @return {jQuery}
	 */
	function button( o ) {
		var $btn = $( '<button>' )
			.attr( { type: 'button', title: o.label, 'aria-label': o.label } )
			.addClass( 'cp-btn cp-btn-' + ( o.color || 'neutral' ) + ( o.iconOnly ? ' cp-btn-iconly' : '' ) )
			.append( icon( o.icon ) );
		if ( !o.iconOnly ) {
			$btn.append( $( '<span>' ).addClass( 'cp-btn-label' ).text( o.label ) );
		}
		$btn.on( 'click', function ( e ) {
			e.preventDefault();
			if ( !$btn.prop( 'disabled' ) ) {
				o.onClick( $btn );
			}
		} );
		return $btn;
	}

	/**
	 * Pastille de statut : icône colorée + libellé (ou nom seul en mode compact).
	 *
	 * @param {Object} entry
	 * @param {Object} [o]
	 * @param {boolean} [o.compact] Pas de libellé de statut (l'icône suffit)
	 * @param {boolean} [o.showComment]
	 * @return {jQuery}
	 */
	function statusBadge( entry, o ) {
		o = o || {};
		var elapsed = CP.now() - entry.timestamp * 1000;
		var urgent = entry.status === 'pending' && elapsed > CP.config.urgencyThreshold;
		var meta = CP.getStatusMeta( entry.status, urgent );
		var label = CP.getStatusLabel( entry.status );
		var time = CP.formatTimeElapsed( elapsed );

		var tooltip = label + ' — ' + entry.userText + ' • ' + time +
			( entry.comment ? '\n' + entry.comment : '' );

		var $badge = $( '<span>' )
			.addClass( 'cp-status cp-status-' + meta.cls )
			.attr( 'title', tooltip )
			.append( $( '<span>' ).addClass( 'cp-status-ico' ).append( icon( meta.icon ) ) );

		var $text = $( '<span>' ).addClass( 'cp-status-text' );
		if ( !o.compact ) {
			$text.append( $( '<strong>' ).text( label ), ' — ' );
		}
		$text.append( document.createTextNode( entry.userText ) );
		$text.append( $( '<span>' ).addClass( 'cp-status-time' ).text( ' • ' + time ) );
		if ( o.showComment && entry.comment ) {
			$text.append( $( '<span>' ).addClass( 'cp-status-comment' ).text( ' (' + entry.comment + ')' ) );
		}
		return $badge.append( $text );
	}

	/**
	 * Bloc d'historique ; chaque ligne est colorée selon l'action
	 * (trait à gauche + titre).
	 *
	 * @param {Object[]} history
	 * @return {jQuery}
	 */
	function historyBlock( history ) {
		var $block = $( '<div>' ).addClass( 'cp-history' );
		history.forEach( function ( item ) {
			var meta = CP.getStatusMeta( item.action );
			var $line = $( '<div>' ).addClass( 'cp-history-item cp-history-' + meta.cls );
			$line.append(
				$( '<span>' ).addClass( 'cp-history-title' ).text( CP.getStatusLabel( item.action ) ),
				$( '<span>' ).addClass( 'cp-history-meta' ).text(
					' — ' + item.userText + ' • ' + CP.formatTimeElapsed( CP.now() - item.timestamp * 1000 )
				)
			);
			if ( item.comment ) {
				$line.append( $( '<span>' ).addClass( 'cp-history-comment' ).text( ' « ' + item.comment + ' »' ) );
			}
			$block.append( $line );
		} );
		return $block;
	}

	CP.w = {
		icon: icon,
		button: button,
		statusBadge: statusBadge,
		historyBlock: historyBlock
	};

}() );
