//This is the source code for both clone and site generation custom workflow actions
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const dtm = require('date-fns');

//AUX FUNCTIONS
function padToTwo (number) {
    return (number > 9 ? number : ('0' + number))
}

function dateOnly(dtUTC){

    const year = dtUTC.getUTCFullYear()
    const month = dtUTC.getUTCMonth() + 1 //Date provides month index; not month number
    const day = dtUTC.getUTCDate()

    return(`${year}-${padToTwo(month)}-${padToTwo(day)}`);
}

function getMonth (dt) {

    switch(dt.substring(5,7)){
        case '01':
            return 'Jan'
        case '02':
            return 'Feb'
        case '03':
            return 'Mar'
        case '04':
            return 'Apr'
        case '05':
            return 'May'
        case '06':
            return 'Jun'
        case '07':
            return 'Jul'
        case '08':
            return 'Aug'
        case '09':
            return 'Sep'
        case '10':
            return 'Oct'
        case '11':
            return 'Nov'
        case '12':
            return 'Dec'
        
    }
}

async function copyLineItem(newLineItem, id, newDeal, createdDealId, headers){
    try{

        var lItem = await axios.get(`https://api.hubapi.com/crm/v3/objects/line_items/${id}?properties=price,recurringbillingfrequency,hs_recurring_billing_period,hs_product_id,quantity,discount,hs_sku&archived=false`, { headers: headers}); //Get the original line item to extract its info and create the new one

        var lItemData = lItem.data;
        const SKU = lItemData.properties.hs_sku;

        if(SKU.includes("-SUB") || SKU.includes("-SUB-") || SKU.includes("SUB-")){//Only keep subscription line items

            newLineItem.properties.price = lItemData.properties.price;
            newLineItem.properties.recurringbillingfrequency = lItemData.properties.recurringbillingfrequency;
            newLineItem.properties.hs_recurring_billing_period = "P12M";//Term set to 12 months on renewal
            newLineItem.properties.hs_product_id = lItemData.properties.hs_product_id; //Pulls the name and the SKU from the product
            newLineItem.properties.quantity = lItemData.properties.quantity;
            newLineItem.properties.hs_recurring_billing_start_date = newDeal.properties.project_start_date;

            if (lItemData.properties.discount != null){
                newLineItem.properties.discount = lItemData.properties.discount;
            } else {
                newLineItem.properties.discount = 0;
            }

            newLineItem.associations.push(
                {
                    "to": {"id": createdDealId},//RecordID of the new deal created
                    "types": [{
                        "associationCategory": "HUBSPOT_DEFINED",
                        "associationTypeId": 20
                    }]
                }
            )

            console.log("NEW LINE ITEM:")
            console.log(newLineItem);

            axios.post("https://api.hubapi.com/crm/v3/objects/line_item", JSON.stringify(newLineItem), { headers: headers });

        }

    } catch (e){
        console.log(`Error while creating and adding line item to new deal: ${e}\n Line item NOT ADDED.`);
    }
}

//IMPLEMENTATION
const app = express(); //Express initialization

app.use(express.json()); //Considers every response or request got as JSON converting it directly into a JavaScript object

app.listen("3000", function(err){
if (err){console.log("Error in server setup")} else {console.log("Server is listenning on port 3000")}
});

app.get("/createRenewal", async (req, res) => {

    //const originDealRecordID = req.body.object.properties.hs_object_id; //the payload will be sent in the body of the request once the API is called by the HubSpot workflow
    //const createdByWf1 = req.body.inputFields.created_by_WF1;//the payload will be sent in the body of the request once the API is called by the HubSpot workflow

    console.log("Request recebido");
    const originDealRecordID = 1234567890; //TEST ONLY
    const createdByWf1 = false; //TEST ONLY

    const headers = {
        Authorization: `Bearer ${process.env.ACESS_TOKEN}`, 
        'Content-Type': 'application/json'
    }

    try{   

        var dealResp = await axios.get(`https://api.hubapi.com/crm/v3/objects/deals/${originDealRecordID}?properties=pipeline,dealname,clone_delete_switch,prorated,deal_renewal_date,dealtype,business_unit,ebc_customer_success_rep,lead_source,type__cloned_,project_type,hubspot_owner_id,amount&associations=line_items,deals,companies,p6758651_sites&archived=false`, { headers: headers });

        var dealData = dealResp.data;

    } catch (e){
        console.log(`Error in fetching the originating deal record from HubSpot. Message: ${e}`);
        res.status(502).send(`Error in fetching the originating deal record from HubSpot. Message: ${e}`);
    }

    const pipeline = dealData.properties.pipeline;
    const cloneDelete = dealData.properties.clone_delete_switch;
    const prorated = dealData.properties.prorated;   
    
    if ('companies' in dealData.associations){

        const companies = dealData.associations.companies.results;

        let primaryCompanyId = -1;

        for (let i of companies){ //Get the primary company id
            if (i.type == 'deal_to_company'){//deal_to_company is the label for the primary company
                primaryCompanyId = i.id;
                break;
            }
        }

        if(primaryCompanyId == -1){
            var companyData = {id: -1, properties: {name: "[Company Not Set]"}}
        } else {
            try{ //Getting the primary company from hubspot to access its name

                var companyResp = await axios.get(`https://api.hubapi.com/crm/v3/objects/companies/${primaryCompanyId}?properties=name&archived=false`, { headers: headers });
    
                var companyData = companyResp.data;
    
            } catch (e){
                console.log(`Error in fetching the primary company record from HubSpot. Message: ${e}.\n Setting company as blank`);
                var companyData = {id: -1, properties: {name: "[Company Name]"}}
            }
        }
    } else {
        var companyData = {id: -1, properties: {name: "[Company Not Set]"}}
    }

    if(pipeline == "100000"){ //Checks if the deal is a renewal deal
        //Only clone
        const newDeal = {properties: {}, associations: []};

        newDeal.properties.pipeline = 60875390;//Renewals pipeline
        
        if(dealData.properties.deal_renewal_date == null || dealData.properties.deal_renewal_date == ""){//Renewals are supossed to always have the date set - failsafe

            newDeal.properties.dealstage = 100001;//Start date pending to be set stage

            newDeal.properties.project_start_date = null;
            newDeal.properties.closedate = null;
            newDeal.properties.deal_renewal_date = null;

            newDeal.properties.dealname = `${companyData.properties.name} - ${dealData.properties.project_type.replaceAll(";", "/")} Renewal: [Start and Renewal dates not set]`;

        } else {
            newDeal.properties.dealstage = 100002;//+12-9 months stage

            newDeal.properties.project_start_date = dateOnly(dtm.addDays(new Date(dealData.properties.deal_renewal_date), 1));
            newDeal.properties.closedate = dateOnly(new Date(dealData.properties.deal_renewal_date));
            newDeal.properties.deal_renewal_date = dateOnly(dtm.addYears(new Date(dealData.properties.deal_renewal_date), 1));
            //Date fns methods retuns a Date object in UTC format but formatting functions consider local time-zone for date formatting. In order for it to be time-zone agnostic, the function dateOnly is used to create a string with only the date before any parsing

            newDeal.properties.dealname = `${companyData.properties.name} - ${dealData.properties.project_type.replaceAll(";", "/")} Renewal: ${getMonth(newDeal.properties.project_start_date)} ${(newDeal.properties.project_start_date).substring(0,4)} - ${getMonth(newDeal.properties.deal_renewal_date)} ${(newDeal.properties.deal_renewal_date).substring(0,4)}`;

        }
        
        newDeal.properties.amount = dealData.properties.amount;
        newDeal.properties.business_unit = dealData.properties.business_unit;
        newDeal.properties.dealtype = dealData.properties.dealtype;
        newDeal.properties.ebc_customer_success_rep = dealData.properties.ebc_customer_success_rep;
        newDeal.properties.lead_source = dealData.properties.lead_source;
        newDeal.properties.project_type = dealData.properties.project_type;//Deal Products property
        newDeal.properties.type__cloned_ = dealData.properties.type__cloned_;//Type property
        newDeal.properties.hubspot_owner_id = dealData.properties.hubspot_owner_id;
        
        if(createdByWf1 == null){
            newDeal.properties.created_by_wf1 = true;
        } else {
            newDeal.properties.created_by_wf1 = !createdByWf1;//Needs to invert the value it previously had
        }

        if(companyData.id != -1){//Originating deal is associated to a company
            newDeal.associations.push(

                {
                    "to": {"id": companyData.id},
                    "types": [{
                        "associationCategory": "HUBSPOT_DEFINED",
                        "associationTypeId": 5 //primary company
                    }]
                }
    
            );//Deal to company
        }

        newDeal.associations.push(

            {
                "to": {"id": dealData.id},
                "types": [{
                    "associationCategory": "USER_DEFINED",
                    "associationTypeId": 48 //Means the label "Originating deal"
                }]
            } //Setting this direction of the label updates the other associated deal with the other correspont label (is a paired label)

        );//Deal to Deal
        
        if ('p6758651_sites' in dealData.associations){
            const sites = dealData.associations.p6758651_sites.results;
            for (let i of sites){
                newDeal.associations.push(
                    {
                        "to": {"id": i.id},
                        "types": [{
                            "associationCategory": "USER_DEFINED",
                            "associationTypeId": 22 //Assocoation from deals to sites"
                        }]
                    }
                );
            };//Deal to all sites on the previous deal
        }

        try {
            var createdDealId = 0;
            await axios.post("https://api.hubapi.com/crm/v3/objects/deals", JSON.stringify(newDeal), { headers: headers }).then((dealRes) => { createdDealId = dealRes.data.id});

            res.status(200).send("OK");
            
        } catch(e){
            res.status(502).send(`An error occurred while creating the deal record: ${e}\n The renewal deal was not created.`);
        }

        if ('line items' in dealData.associations){
            const lineItems = dealData.associations['line items'].results;

            for (let i of lineItems){ //Iterating over the list "results" to get the id of each line item to copy its info. New line items need to be created one by one directly into the new deal as they are not objects and can't be associated with more than one deal.
            
            const newLineItem = {properties: {}, associations: []};
            copyLineItem(newLineItem, i.id, newDeal, createdDealId, headers);
            }
        }
    
    } else {
        if (prorated == "Yes_existing_renewal"){

            const newDeal = {properties: {}, associations: []};

            newDeal.properties.pipeline = 200000;//Renewals pipeline
            newDeal.properties.project_start_date = null;
            newDeal.properties.deal_renewal_date = null;

            if (dealData.properties.deal_renewal_date != null && dealData.properties.deal_renewal_date != ""){//For time reference of when to close
                newDeal.properties.closedate = dateOnly(new Date(dealData.properties.deal_renewal_date))
                newDeal.properties.dealstage = 200001;//+12-9 months stage
            } else {
                newDeal.properties.closedate = null;
                newDeal.properties.dealstage = 200002;//Start date pending to be set stage
            }

            newDeal.properties.dealname = `[TO BE MERGED] ${companyData.properties.name} - ${dealData.properties.project_type.replaceAll(";", "/")} Renewal: Prorated`;

            newDeal.properties.amount = dealData.properties.amount;
            newDeal.properties.business_unit = dealData.properties.business_unit;
            newDeal.properties.project_type = dealData.properties.project_type;//Deal products property (remains the same)
            newDeal.properties.ebc_customer_success_rep = dealData.properties.ebc_customer_success_rep;
            newDeal.properties.hubspot_owner_id = dealData.properties.hubspot_owner_id;
            newDeal.properties.created_by_wf1 = false;

            newDeal.properties.dealtype = "existingbusiness";//CHANGES TO EXISTING BUSINESS
            newDeal.properties.lead_source = "Client Internal";//CHANGES TO CLIENT INTERNAL
            
            if(dealData.properties.business_unit == "EBC"){
                newDeal.properties.type__cloned_ = "Client - CompanyA"   
            } else if(dealData.properties.business_unit == "Work Place" || dealData.properties.business_unit == "Retail"){
                newDeal.properties.type__cloned_ = "Client - CompanyB"
            } else {
                newDeal.properties.type__cloned_ = null;
            }

            //Dates won't matter as the renewal will be merged to another one with its own date system

            if(companyData.id != -1){//Originating deal is associated to a company
                newDeal.associations.push(
    
                    {
                        "to": {"id": companyData.id},
                        "types": [{
                            "associationCategory": "HUBSPOT_DEFINED",
                            "associationTypeId": 5 //primary company
                        }]
                    }
        
                );//Deal to company
            }
    
            newDeal.associations.push(
    
                {
                    "to": {"id": dealData.id},
                    "types": [{
                        "associationCategory": "USER_DEFINED",
                        "associationTypeId": 48 //Means the label "Originating deal"
                    }]
                } //Setting this direction of the label updates the other associated deal with the other correspont label (is a paired label)
    
            );//Deal to Deal

            if ('p6758651_sites' in dealData.associations){
                const sites = dealData.associations.p6758651_sites.results;
                for (let i of sites){
                    newDeal.associations.push(
                        {
                            "to": {"id": i.id},
                            "types": [{
                                "associationCategory": "USER_DEFINED",
                                "associationTypeId": 22 //Assocoation from deals to sites
                            }]
                        }
                    );
                };//Deal to all sites on the previous deal
            }
    
            try {
                var createdDealId = 0;
                await axios.post("https://api.hubapi.com/crm/v3/objects/deals", JSON.stringify(newDeal), { headers: headers }).then((dealRes) => { createdDealId = dealRes.data.id});
    
                res.status(200).send("OK");
                
            } catch(e){
                res.status(502).send(`An error occurred while creating the deal record: ${e}\n The renewal deal was not created.`);
            }
            

            if ('line items' in dealData.associations){
                const lineItems = dealData.associations['line items'].results;
    
                for (let i of lineItems){ //Iterating over the list "results" to get the id of each line item to copy its info. New line items need to be created one by one directly into the new deal as they are not objects and can't be associated with more than one deal.
                
                const newLineItem = {properties: {}, associations: []};
                copyLineItem(newLineItem, i.id, newDeal, createdDealId, headers);
                }
            }


        } else{

            const newDeal = {properties: {}, associations: []};

            newDeal.properties.pipeline = 300000;//Renewals pipeline
            newDeal.properties.amount = dealData.properties.amount;
            newDeal.properties.business_unit = dealData.properties.business_unit;
            newDeal.properties.project_type = dealData.properties.project_type;//Deal products property (remains the same)
            newDeal.properties.ebc_customer_success_rep = dealData.properties.ebc_customer_success_rep;
            newDeal.properties.hubspot_owner_id = dealData.properties.hubspot_owner_id;
            newDeal.properties.created_by_wf1 = false;

            newDeal.properties.dealtype = "existingbusiness";//CHANGES TO EXISTING BUSINESS
            newDeal.properties.lead_source = "Client Internal";//CHANGES TO CLIENT INTERNAL
            
            if(dealData.properties.business_unit == "EBC"){
                newDeal.properties.type__cloned_ = "Client - CompanyA"   
            } else if(dealData.properties.business_unit == "Work Place" || dealData.properties.business_unit == "Retail"){
                newDeal.properties.type__cloned_ = "Client - CompanyB"
            } else {
                newDeal.properties.type__cloned_ = null;
            }

            if(companyData.id != -1){//Originating deal is associated to a company
                newDeal.associations.push(
    
                    {
                        "to": {"id": companyData.id},
                        "types": [{
                            "associationCategory": "HUBSPOT_DEFINED",
                            "associationTypeId": 5 //primary company
                        }]
                    }
        
                );//Deal to company
            }

            newDeal.associations.push(
    
                {
                    "to": {"id": dealData.id},
                    "types": [{
                        "associationCategory": "USER_DEFINED",
                        "associationTypeId": 48 //Means the label "Originating deal"
                    }]
                } //Setting this direction of the label updates the other associated deal with the other correspont label (is a paired label)
    
            );//Deal to Deal

            if ('sites' in dealData.associations){
                const sites = dealData.associations.p6758651_sites.results;
                for (let i of sites){
                    newDeal.associations.push(
                        {
                            "to": {"id": i.id},
                            "types": [{
                                "associationCategory": "USER_DEFINED",
                                "associationTypeId": 22 //Assocoation from deals to sites"
                            }]
                        }
                    );
                };//Deal to all sites on the previous deal
            }

            if (dealData.properties.deal_renewal_date == null || dealData.properties.deal_renewal_date == ""){//Deal renewal date not set yet

                newDeal.properties.dealstage = 300001;//Start date pending to be set stage
                newDeal.properties.project_start_date = null;
                newDeal.properties.deal_renewal_date = null;
                newDeal.properties.closedate = null
                newDeal.properties.dealname = `${companyData.properties.name} - ${dealData.properties.project_type.replaceAll(";", "/")} Renewal: TBD - TBD`;
                newDeal.properties.is_temporary_deal = true;

                try {
                    var createdDealId = 0;
                    await axios.post("https://api.hubapi.com/crm/v3/objects/deals", JSON.stringify(newDeal), { headers: headers }).then((dealRes) => { createdDealId = dealRes.data.id});
        
                    res.status(200).send("OK");
                    
                } catch(e){
                    res.status(502).send(`An error occurred while creating the deal record: ${e}\n The renewal deal was not created.`);
                }
    
                if ('line items' in dealData.associations){
                    const lineItems = dealData.associations['line items'].results;
        
                    for (let i of lineItems){ //Iterating over the list "results" to get the id of each line item to copy its info. New line items need to be created one by one directly into the new deal as they are not objects and can't be associated with more than one deal.
                    
                    const newLineItem = {properties: {}, associations: []};
                    copyLineItem(newLineItem, i.id, newDeal, createdDealId, headers);
                    }
                }

            } else {

                newDeal.properties.dealstage = 300002;//+12-9 months stage
                newDeal.properties.project_start_date = dateOnly(dtm.addDays(new Date(dealData.properties.deal_renewal_date), 1));
                newDeal.properties.closedate = dateOnly(new Date(dealData.properties.deal_renewal_date));
                newDeal.properties.deal_renewal_date = dateOnly(dtm.addYears(new Date(dealData.properties.deal_renewal_date), 1));
                //Date fns methods retuns a Date object in UTC format but formatting functions consider local time-zone for date formatting. In order for it to be time-zone agnostic, the function dateOnly is used to create a string with only the date before any parsing

                newDeal.properties.dealname = `${companyData.properties.name} - ${dealData.properties.project_type.replaceAll(";", "/")} Renewal: ${getMonth(newDeal.properties.project_start_date)} ${(newDeal.properties.project_start_date).substring(0,4)} - ${getMonth(newDeal.properties.deal_renewal_date)} ${(newDeal.properties.deal_renewal_date).substring(0,4)}`;

                var success = 0;

                try {
                    var createdDealId = 0;
                    await axios.post("https://api.hubapi.com/crm/v3/objects/deals", JSON.stringify(newDeal), { headers: headers }).then((dealRes) => { createdDealId = dealRes.data.id});
        
                    res.status(200).send("OK");
                    success = 1;
                    
                } catch(e){
                    res.status(502).send(`An error occurred while creating the deal record: ${e}\n The permanent renewal deal was not created.`);
                }
                
    
                if ('line items' in dealData.associations){
                    const lineItems = dealData.associations['line items'].results;
        
                    for (let i of lineItems){ //Iterating over the list "results" to get the id of each line item to copy its info. New line items need to be created one by one directly into the new deal as they are not objects and can't be associated with more than one deal.
                    
                    const newLineItem = {properties: {}, associations: []};
                    copyLineItem(newLineItem, i.id, newDeal, createdDealId, headers);
                    }
                }

                if(cloneDelete == "true" && success == 1){//Means that this deal is being rerun after the date was set because when the renewal was created the start date was not set which means that the renewal date was not calculated and the title is wrong. Success == 1 guarantees that the temporary TBD deal will only be deleted if the new one was created

                    const deals = dealData.associations.deals.results;
                    var dealID = -1;
                    for (let i of deals){ //Get the primary company id
                        if (i.type == 'renewal_deal_originating_deal'){//deal_to_company is the label for the primary company

                            try{   
                                var verifDeal = await axios.get(`https://api.hubapi.com/crm/v3/objects/deals/${i.id}?properties=is_temporary_deal&archived=false`, { headers: headers });
                        
                                var verifDealData = verifDeal.data;

                                if (verifDealData.properties.is_temporary_deal == "true"){
                                    dealID = i.id;
                                    break;
                                }
                        
                            } catch (e){
                                console.log(`Error in fetching the associated deal record from HubSpot. Message: ${e}\n TDB deal may not have been deleted`);
                            }
                        }
                    }

                    if(dealID != -1){

                        try{   

                            await axios.delete(`https://api.hubapi.com/crm/v3/objects/deals/${dealID}`, { headers: headers });
    
                        } catch (e){
    
                            console.log(`Error in deleting TBD renewal deal record from HubSpot. Message: ${e}\n TDB deal was not deleted`);
    
                        }

                    }
                }
            }      
        
        }
    }

});

//MANUAL TESTING BACKLOG
//- Test With more than one associated renewal deal
//- Test each one of the 5 scenarios (renewal TESTED, to be merged with date TESTED, to be merged without date TESTED, renewal from closed won with date TESTED, renewal from closed won without date TESTED, clone delete TESTED)
//- Test with non Sub line items TESTED
//- Test with misssing sites TESTED
//- Test with missing company TESTED
//- Test with no line items TESTED
//- Test with more than one renewal deal under clone delete (with only one having the temporary deal as yes) TESTED
//- Test if createdByWf1 property is having the correct value
//- Test deployment on hubspot test account TESTED
//Solve TODOs OK