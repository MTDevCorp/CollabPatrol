<?php

namespace MediaWiki\Extension\CollabPatrol;

/**
 * Extracts @mentions from a chat message.
 *
 * Supported syntaxes:
 *  - @Username            (underscores are read as spaces: @Jean_Dupont)
 *  - @[User with spaces]
 */
class MentionParser {

	public const MAX_MENTIONS = 5;

	private const MAX_CANDIDATES = 10;

	private const PATTERN = '/(?<![\p{L}\p{N}_@\/])@(?:\[([^\[\]\r\n]{1,85})\]|([\p{L}\p{N}_][\p{L}\p{N}_.\'\-]{0,84}))/u';

	/**
	 * @param string $message
	 * @return array[] List of [ 'raw' => string, 'name' => string ]
	 */
	public static function extract( string $message ): array {
		if ( !preg_match_all( self::PATTERN, $message, $matches, PREG_SET_ORDER ) ) {
			return [];
		}

		$found = [];
		foreach ( $matches as $m ) {
			if ( isset( $m[2] ) && $m[2] !== '' ) {
				$name = rtrim( $m[2], ".'-" );
				if ( $name === '' ) {
					continue;
				}
				$raw = '@' . $name;
			} else {
				$name = $m[1] ?? '';
				$raw = '@[' . $name . ']';
			}
			$name = trim( str_replace( '_', ' ', $name ) );
			if ( $name === '' ) {
				continue;
			}
			$found[$raw] = [ 'raw' => $raw, 'name' => $name ];
			if ( count( $found ) >= self::MAX_CANDIDATES ) {
				break;
			}
		}

		return array_values( $found );
	}
}
