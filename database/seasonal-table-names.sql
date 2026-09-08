-- Hernoem de publieke weekendlabels zonder de stabiele slugs of datums te raken.
--
-- De vorige versie van dit bestand kon niet draaien: hij schreef naar een kolom
-- `display_name` die niet bestaat, en vergeleek `id` — een uuid — met 'weekend-01'.
-- De tabel heeft `slug text unique` en `label text`; die worden hieronder gebruikt.
--
-- Idempotent: tweemaal draaien geeft hetzelfde resultaat. Raakt de betaalpoort niet.
update public.tavern_weekends
set label = case slug
  when 'weekend-01' then 'The Halloween Table'
  when 'weekend-02' then 'The Autumn Table'
  else label
end
where slug in ('weekend-01', 'weekend-02');
