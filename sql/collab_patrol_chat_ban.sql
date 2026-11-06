CREATE TABLE IF NOT EXISTS /*_*/collab_patrol_chat_ban (
	cpcb_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
	cpcb_user_text VARBINARY(255) NOT NULL DEFAULT '',
	cpcb_banned_by VARBINARY(255) NOT NULL DEFAULT '',
	cpcb_reason VARBINARY(1024) NOT NULL DEFAULT '',
	cpcb_timestamp VARBINARY(14) NOT NULL DEFAULT ''
) /*$wgDBTableOptions*/;

CREATE UNIQUE INDEX /*i*/cpcb_user_text ON /*_*/collab_patrol_chat_ban (cpcb_user_text);
