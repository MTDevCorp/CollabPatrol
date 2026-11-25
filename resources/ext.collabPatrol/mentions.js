( function () {
	'use strict';

	var CP = window.CollabPatrol;
	var LETTER = /[A-Za-z0-9_\u00C0-\u024F]/;
	var PRECEDING = /[A-Za-z0-9_@/\u00C0-\u024F]/;

	/**
	 * Renders a chat message into $el, turning resolved @mentions into user links.
	 *
	 * @param {jQuery} $el Target element (its content is replaced)
	 * @param {string} text Raw message
	 * @param {Array} mentions [ { raw: '@Jean', name: 'Jean' }, ... ] as resolved by the server
	 * @return {boolean} True if the current user is mentioned
	 */
	function renderText( $el, text, mentions ) {
		var selfMentioned = false;
		$el.empty();

		if ( !mentions || !mentions.length ) {
			$el.text( text );
			return false;
		}

		var byRaw = {};
		var alternatives = mentions.map( function ( m ) {
			byRaw[ m.raw ] = m.name;
			return m.raw;
		} ).sort( function ( a, b ) {
			return b.length - a.length;
		} ).map( function ( raw ) {
			return mw.util.escapeRegExp( raw );
		} );

		var re = new RegExp( '(' + alternatives.join( '|' ) + ')', 'g' );
		var last = 0;
		var match;

		while ( ( match = re.exec( text ) ) !== null ) {
			var start = match.index;
			var end = start + match[ 0 ].length;
			var before = start > 0 ? text.charAt( start - 1 ) : '';
			var after = end < text.length ? text.charAt( end ) : '';
			var bracket = match[ 0 ].charAt( 1 ) === '[';

			if ( ( before && PRECEDING.test( before ) ) || ( !bracket && after && LETTER.test( after ) ) ) {
				continue;
			}

			var name = byRaw[ match[ 0 ] ];
			var isSelf = name === CP.userName;
			selfMentioned = selfMentioned || isSelf;

			$el.append( document.createTextNode( text.slice( last, start ) ) );
			$el.append(
				$( '<a>' )
					.addClass( 'cp-chat-mention' + ( isSelf ? ' cp-chat-mention-self' : '' ) )
					.attr( 'href', mw.util.getUrl( 'User:' + name ) )
					.text( '@' + name )
			);
			last = end;
		}

		$el.append( document.createTextNode( text.slice( last ) ) );
		return selfMentioned;
	}

	/**
	 * Adds @username autocompletion to a textarea.
	 *
	 * @param {jQuery} $input
	 */
	function attachAutocomplete( $input ) {
		var api = new mw.Api();
		var $list = $( '<ul>' ).addClass( 'cp-mention-list' ).attr( 'role', 'listbox' ).hide();
		var token = null;
		var items = [];
		var active = -1;
		var timer = null;
		var requestId = 0;

		$input.after( $list );

		function hide() {
			$list.hide().empty();
			items = [];
			active = -1;
		}

		function setActive( index ) {
			active = index;
			$list.children().each( function ( i ) {
				$( this ).toggleClass( 'cp-mention-active', i === index );
			} );
		}

		function currentToken() {
			var el = $input[ 0 ];
			var caret = el.selectionStart;
			if ( typeof caret !== 'number' ) {
				return null;
			}
			var m = /(^|\s|\()@([^\s@[\]]{1,40})$/.exec( el.value.slice( 0, caret ) );
			if ( !m ) {
				return null;
			}
			return { prefix: m[ 2 ], end: caret, start: caret - m[ 2 ].length - 1 };
		}

		function choose( name ) {
			if ( !token ) {
				return;
			}
			var el = $input[ 0 ];
			var insertion = ( /[^\w\u00C0-\u024F.'-]/.test( name ) ? '@[' + name + ']' : '@' + name ) + ' ';
			el.value = el.value.slice( 0, token.start ) + insertion + el.value.slice( token.end );
			var pos = token.start + insertion.length;
			el.setSelectionRange( pos, pos );
			hide();
			$input.trigger( 'input' ).trigger( 'focus' );
		}

		function show( names ) {
			$list.empty();
			items = names;
			names.forEach( function ( name, i ) {
				$( '<li>' )
					.attr( 'role', 'option' )
					.text( name )
					.on( 'mousedown', function ( e ) {
						e.preventDefault();
						choose( name );
					} )
					.on( 'mouseenter', function () {
						setActive( i );
					} )
					.appendTo( $list );
			} );
			if ( names.length ) {
				$list.show();
				setActive( 0 );
			} else {
				hide();
			}
		}

		function search() {
			token = currentToken();
			if ( !token ) {
				hide();
				return;
			}
			var id = ++requestId;
			api.get( {
				action: 'query',
				list: 'allusers',
				auprefix: token.prefix.replace( /_/g, ' ' ),
				aulimit: 6,
				formatversion: 2
			} ).then( function ( data ) {
				if ( id !== requestId ) {
					return;
				}
				var users = ( data.query && data.query.allusers ) || [];
				show( users.map( function ( u ) {
					return u.name;
				} ) );
			}, hide );
		}

		$input.on( 'input click', function () {
			clearTimeout( timer );
			timer = setTimeout( search, 200 );
		} );

		$input.on( 'blur', function () {
			setTimeout( hide, 150 );
		} );

		$input.on( 'keydown', function ( e ) {
			if ( !items.length ) {
				return;
			}
			if ( e.key === 'ArrowDown' ) {
				e.preventDefault();
				setActive( ( active + 1 ) % items.length );
			} else if ( e.key === 'ArrowUp' ) {
				e.preventDefault();
				setActive( ( active - 1 + items.length ) % items.length );
			} else if ( ( e.key === 'Enter' && !e.ctrlKey && !e.metaKey ) || e.key === 'Tab' ) {
				e.preventDefault();
				choose( items[ active < 0 ? 0 : active ] );
			} else if ( e.key === 'Escape' ) {
				e.preventDefault();
				hide();
			}
		} );
	}

	CP.mentions = {
		renderText: renderText,
		attachAutocomplete: attachAutocomplete
	};

}() );
