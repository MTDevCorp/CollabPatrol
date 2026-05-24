CREATE TABLE IF NOT EXISTS /*_*/collab_patrol_chat_mention (
	cpcm_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	cpcm_msg_id BIGINT UNSIGNED NOT NULL,
	cpcm_rev_id BIGINT UNSIGNED NOT NULL,
	cpcm_target_user_id INT UNSIGNED NOT NULL DEFAULT 0,
	cpcm_target_user_text VARBINARY(255) NOT NULL,
	cpcm_from_user_id INT UNSIGNED NOT NULL DEFAULT 0,
	cpcm_from_user_text VARBINARY(255) NOT NULL,
	cpcm_timestamp BINARY(14) NOT NULL,
	PRIMARY KEY (cpcm_id)
) /*$wgDBTableOptions*/;

CREATE UNIQUE INDEX /*i*/cpcm_msg_target ON /*_*/collab_patrol_chat_mention (cpcm_msg_id, cpcm_target_user_text);
CREATE INDEX /*i*/cpcm_target_timestamp ON /*_*/collab_patrol_chat_mention (cpcm_target_user_text, cpcm_timestamp);
CREATE INDEX /*i*/cpcm_rev_id ON /*_*/collab_patrol_chat_mention (cpcm_rev_id);
