# HubSpot App Renewal Deal Creation
HubSpot App implemented as an API called by a HubSpot workflow to automatically create renewal deals for closed deals enhancing coverage and avoiding loss of recurring business.

Motivation:\
\
While working for the company, I was in charge of redesigning their sales process within their HubSpot CRM. To make the new planned flow possible, I had to develop a custom integration to generate a renewal deal with custom dates, copied and filtered product information whenever a new deal was closed, something Hubspot's workflows couldn't do. This step was vital to create a closed loop, ensuring no recurring revenue was lost, a big pain point in the old process where renewal deals were tracked on a spreadsheet.

Technical Implementation:\
\
The integration was developed using NodeJs and ExpressJs and works as an API called by a HubSpot workflow. It accounts for 6 different scenarios for the renewal deal creation, interacts with several different HubSpot APIs doing GET, POST and DELETE requests, accounts for the possibility of having multiple different information fields empty and handles errors. After extensive testing the integration showed to be working perfectly which was a great result as I developed it on my own and had little knowledge in NodeJs/ExpressJs prior to taking up this task.
