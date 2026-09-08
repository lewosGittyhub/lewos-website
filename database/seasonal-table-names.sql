-- Rename the public weekend labels without changing their stable IDs or dates.
update public.tavern_weekends
set display_name = case id
  when 'weekend-01' then 'The Halloween Table'
  when 'weekend-02' then 'The Autumn Table'
  else display_name
end
where id in ('weekend-01','weekend-02');
