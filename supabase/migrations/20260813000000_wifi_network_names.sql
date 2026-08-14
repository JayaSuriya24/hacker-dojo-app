-- ---------------------------------------------------------------------------
-- Wi-Fi network names, as they actually appear on the wall.
--
-- `dojo-5g` was a placeholder carried over from the first seed and never what
-- the access points broadcast. A member reads this card while looking at their
-- phone's network list, so a name that does not match the one they can see is
-- worse than no name at all — it reads as "you are on the wrong network".
--
-- Values only. Nothing about the schema, the per-member PIN or the guest
-- password changes here.
-- ---------------------------------------------------------------------------

update public.site_settings
   set value = 'Hacker Dojo'
 where key = 'wifi_ssid';

update public.site_settings
   set value = 'Hacker Dojo Free'
 where key = 'wifi_guest_ssid';
