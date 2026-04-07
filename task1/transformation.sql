create table transformed_yearly_summary as 
	select year, 
		count(*), 
		round(avg(
		case
			when price like '$%' then 
				cast(replace(price, '$', '') as numeric)
			when price like '€%' then
				cast(replace(price, '€', '') as numeric) * 1.2
		end
		), 2)
		from books
		group by year;