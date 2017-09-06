/***
 This file shall contain ROS relate function calls.
 TODO: Store user selections across postbacks especially when page is refreshed by user.
 TODO: Cut down the # of logs shown.
 TODO: Set timeout on Modal.
****/

// Deployment variables
var ip = '192.168.32.133'; // TODO: Update with proper environment IP address.
var top_ns = ''; //TODO: Update the prefix for CAV Prototype system namespace.

// Global variables
var ros = new ROSLIB.Ros();

var system_ready = false;
var route_name = '';
var guidance_engaged = false;
var ready_counter = 0;
var ready_max_trial = 3;

var host_instructions = '';
var listenerPluginAvailability;

var divCapabilitiesMessage = document.getElementById('divCapabilitiesMessage');


/*
* Connection to ROS
*/
function connectToROS() {

    try {
        // If there is an error on the backend, an 'error' emit will be emitted.
        ros.on('error', function (error) {
            document.getElementById('divLog').innerHTML += '<br/> ROS Connection Error.';
            divCapabilitiesMessage.innerHTML = '<p> Sorry, unable to connect to ROS server, please refresh your page to try again or contact your System Admin.</p>';
            console.log(error);

            document.getElementById('connecting').style.display = 'none';
            document.getElementById('connected').style.display = 'none';
            document.getElementById('closed').style.display = 'none';
            document.getElementById('error').style.display = 'inline';
        });

        // Find out exactly when we made a connection.
        ros.on('connection', function () {
            document.getElementById('divLog').innerHTML += '<br/> ROS Connection Made.';

            document.getElementById('connecting').style.display = 'none';
            document.getElementById('error').style.display = 'none';
            document.getElementById('closed').style.display = 'none';
            document.getElementById('connected').style.display = 'inline';
        });

        ros.on('close', function () {
            document.getElementById('divLog').innerHTML += '<br/> ROS Connection Closed.';

            document.getElementById('connecting').style.display = 'none';
            document.getElementById('connected').style.display = 'none';
            document.getElementById('closed').style.display = 'inline';
        });

        // Create a connection to the rosbridge WebSocket server.
        ros.connect('ws://' + ip + ':9090');

    }
    catch(err) {
         divCapabilitiesMessage.innerHTML = '<p> Unexpected Error. Sorry, unable to connect to ROS server, please refresh your page to try again or contact your System Admin.</p>';
         console.log(err);
    }
}


/**
* Check System Alerts from Interface Manager
* TODO: Implement the user notification or modal popup.
**/
function checkSystemAlerts() {

    // Subscribing to a Topic
    var listener = new ROSLIB.Topic({
        ros: ros,
        name: top_ns + '/system_alert',
        messageType: 'cav_msgs/SystemAlert'
    });

    // Then we add a callback to be called every time a message is published on this topic.
    listener.subscribe(function (message) {

        var messageTypeFullDescription = 'NA';

        switch (message.type) {
            case 1:
                messageTypeFullDescription = 'System received a CAUTION message. ' + message.description;
                break;
            case 2:
                messageTypeFullDescription = 'System received a WARNING message. ' + message.description;
                break;
            case 3:
                messageTypeFullDescription = 'System received a FATAL message. Please wait for system to shut down. ' + message.description;
                //Show modal popup for Fatal alerts.
                showModal(true, messageTypeFullDescription);
                break;
            case 4:
                system_ready = false;
                messageTypeFullDescription = 'System is not ready, please wait and try again. ' + message.description;
                break;
            case 5:
                system_ready = true;
                messageTypeFullDescription = 'System is ready. ' + message.description;
                break;
            default:
                //system_ready = false;
                messageTypeFullDescription = 'System alert type is unknown. Assuming system it not yet ready.  ' + message.description;
        }


        //document.getElementById('divLog').innerHTML += '<br/> ' + messageTypeFullDescription;

        //Show the rest of the system alert messages in the log.
        //Make sure message list is scrolled to the bottom
        var container = document.getElementById('divLog');
        var containerHeight = container.clientHeight;
        var contentHeight = container.scrollHeight;
        container.scrollTop = contentHeight - containerHeight;

        return system_ready;
    });
}

/*
 Show user the available route options.
*/
function showRouteOptions() {

    divCapabilitiesMessage.innerHTML = 'Awaiting the list of available routes...'

    // Create a Service client with details of the service's name and service type.
    var getAvailableRoutesClient = new ROSLIB.Service({
        ros: ros,
        name: top_ns + '/get_available_routes', // '/vehicle_environment/route/get_available_routes',
        serviceType: 'cav_srvs/GetAvailableRoutes'
    });

    // Create a Service Request with no arguments.
    var request = new ROSLIB.ServiceRequest({

    });

    // Call the service and get back the results in the callback.
    // The result is a ROSLIB.ServiceResponse object.
    getAvailableRoutesClient.callService(request, function (result) {

        divCapabilitiesMessage.innerHTML = 'Please select a route.';

        var myRoutes = result.availableRoutes;
        var divRoutes = document.getElementById('divRoutes');

        for (i = 0; i < myRoutes.length; i++) {
            createRadioElement(divRoutes, myRoutes[i].routeID, myRoutes[i].routeName, myRoutes.length, 'groupRoutes');
        }

        if (myRoutes.length == 0) {
            divCapabilitiesMessage.innerHTML = '<p> Sorry, there are no available routes, and cannot proceed without one. </p> <p> Please contact your System Admin.</p>';
        }

    });
}

/*
 Set the route once based on user selection.
*/
function setRoute(id) {

    // Calling setActiveRoute service
    var setActiveRouteClient = new ROSLIB.Service({
        ros: ros,
        name: top_ns +  '/set_active_route', // '/vehicle_environment/route/get_available_routes',
        serviceType: 'cav_srvs/SetActiveRoute'
    });

    // Then we create a Service Request.
    var request = new ROSLIB.ServiceRequest({
        routeID: id.toString().replace('rb','')
    });

    //Selected Route
    var rbRoute = document.getElementById(id.toString());
    var lblRoute = document.getElementById(id.toString().replace('rb','lbl'));

    // Call the service and get back the results in the callback.
    setActiveRouteClient.callService(request, function (result) {

        if (result.errorStatus == 1) //Error: NO_ROUTE
        {
            divCapabilitiesMessage.innerHTML = '<p> Activating the route failed, please try it again.</p>';

            //Allow user to select it again.
            rbRoute.checked = false;
        }
        else { //Call succeeded
            route_name = lblRoute.innerHTML;

            var divRoutes = document.getElementById('divRoutes');
            divRoutes.style.display = 'none';

            var divSubCapabilities = document.getElementById('divSubCapabilities');
            divSubCapabilities.style.display = 'block';

            divCapabilitiesMessage.innerHTML = 'You have selected the route called " ' + route_name + '". ';

            showPluginOptions();
        }
    });
}

/*
 Show user the registered plugins.
*/
function showPluginOptions() {

    divCapabilitiesMessage.innerHTML += 'Please select one or more capabilities to activate. ' ;

    // Create a Service client with details of the service's name and service type.
    var getRegisteredPluginsClient = new ROSLIB.Service({
        ros: ros,
        name: top_ns +  '/plugins/get_registered_plugins',
        serviceType: 'cav_srvs/PluginList'
    });

    // Create a Service Request.
    var request = new ROSLIB.ServiceRequest({
    });

    // Call the service and get back the results in the callback.
    getRegisteredPluginsClient.callService(request, function (result) {

        var pluginList = result.plugins;
        var divSubCapabilities = document.getElementById('divSubCapabilities');
        var cntSelected = 0;

        for (i = 0; i < pluginList.length; i++) {

            var cbTitle = pluginList[i].name + ' ' + pluginList[i].versionId;
            var cbId = pluginList[i].name.replace(/\s/g,'_') + '&' + pluginList[i].versionId.replace(/\./g,'_') ;
            var isChecked = pluginList[i].activated;

            //Create the checkbox based on the plugin properties.
            createCheckboxElement(divSubCapabilities, cbId, cbTitle, pluginList.length, 'groupPlugins', isChecked);
        }

        //If no selection available.
        if (pluginList.length == 0) {
            divCapabilitiesMessage.innerHTML = '<p> Sorry, there are no selection available, and cannot proceed without one. </p> <p> Please contact your System Admin.</p>';
        }

        //Enable the CAV Guidance button if plugins are selected
        enableGuidance();
    });
}

/*
  Activate the plugin based on user selection.
*/
function activatePlugin(id) {

    var cbCapabilities = document.getElementById(id);

    //NOTE: Already set by browser to have NEW checked value.
    var newStatus = cbCapabilities.checked;

    // If guidance is engaged, at least 1 plugin must be selected.
    if (guidance_engaged==true){
        var cntCapabilitiesSelected = getCheckboxesSelected();

        if (cntCapabilitiesSelected==0){
            divCapabilitiesMessage.innerHTML = 'Sorry, Guidance is engaged and there must be at least one active capability.'
                                                + '<br/>You can choose to dis-engage CAV Guidance to inactivate all capablities.';

            //Need to set it back to original value.
            cbCapabilities.checked = !newStatus;

            return;
        }
    }

    // Calling setActiveRoute service
    var activatePluginClient = new ROSLIB.Service({
        ros: ros,
        name: top_ns +  '/plugins/activate_plugins',
        serviceType: 'cav_srvs/PluginList'
    });

    // Get name and version.
    var splitValue = id.replace('cb','').split('&');
    var name = splitValue[0].replace(/\_/g,' ');
    var version = splitValue[1].replace(/\_/g, '.');

    // Setup the request.
    var request = new ROSLIB.ServiceRequest({
        header: {
                  seq: 0
                  , stamp: Date.now()
                  , frame_id:''
        		},
        pluginName: name,
        pluginVersion: version,
        activated: newStatus
    });

    // If it did NOT get into the callService below, need to set it back.
    cbCapabilities.checked = !newStatus;

    // Call the service and get back the results in the callback.
    activatePluginClient.callService(request, function (result) {

        if (result.newState != newStatus) //Failed
        {
            divCapabilitiesMessage.innerHTML = '<p> Activating the capability failed, please try it again.</p>';
        }
        else {
            var divSubCapabilities = document.getElementById('divSubCapabilities');
            divSubCapabilities.style.display = 'block';
            divCapabilitiesMessage.innerHTML = 'Please select one or more capabilities to activate.';
        }

        //Set to new state set by the PluginManager.
        cbCapabilities.checked = result.newState;

        var lblCapabilities = document.getElementById(id.toString().replace('cb','lbl'));

        if (cbCapabilities.checked == false)
        {
            lblCapabilities.style.backgroundColor  = 'gray';
        }
        else if (cbCapabilities.checked == true)
        {
            lblCapabilities.style.backgroundColor  = 'cornflowerblue';
        }

        //Enable the CAV Guidance button if plugins are selected
        enableGuidance();
    });
}

/*
    Enable the Guidance if at least 1 capability is selected.
*/
function enableGuidance(){

        //Enable the CAV Guidance button if plugin(s) are selected
        var btnCAVGuidance = document.getElementById('btnCAVGuidance');
        var cntSelected = getCheckboxesSelected();

        if ( cntSelected > 0)
        {
            //If guidance is engage, leave as green.
            //Else if not engaged, set to blue.
            if (guidance_engaged==false)
            {
                btnCAVGuidance.disabled = false;
                btnCAVGuidance.className = 'button_enabled';
                divCapabilitiesMessage.innerHTML += '<p>' + host_instructions + '</p>';
            }
        }
        else
        {
            btnCAVGuidance.disabled = true;
            btnCAVGuidance.className = 'button_disabled';
        }
}


/*
 Engage and Disengage Guidance.
*/
function engageGuidance() {

    //Set the new status opposite to the current value.
    var newStatus = !guidance_engaged;

    //Call the service to engage guidance.
    var setGuidanceClient = new ROSLIB.Service({
        ros: ros,
        name: top_ns +  '/set_guidance_enable',
        serviceType: 'cav_srvs/SetGuidanceEnabled'
    });

    //Setup the request.
    var request = new ROSLIB.ServiceRequest({
        guidance_enabled: newStatus
    });

    // Call the service and get back the results in the callback.
    setGuidanceClient.callService(request, function (result) {

        if (result.guidance_status != newStatus) //NOT SUCCESSFUL.
        {
            divCapabilitiesMessage.innerHTML = '<p> Guidance failed to set the value, please try again.</p>';
            return;
        }

        //Set based on returned status, regardless if succesful or not.
        guidance_engaged = result.guidance_status;

        if (guidance_engaged == true) //To engage
        {

                divCapabilitiesMessage.innerHTML = 'CAV Guidance has been engaged!'

                //Set the Guidance button to green.
                btnCAVGuidance.className = 'button_engaged';

                //Start checking availability if Guidance has been engaged.
                checkAvailability();
        }
        else //To dis-engage
        {
                divCapabilitiesMessage.innerHTML = 'Please select one or more capabilities to activate.';
                btnCAVGuidance.disabled = false;
                btnCAVGuidance.className = 'button_enabled';

                //When disengaging, mark all selected plugins to blue.
                setCbSelectedBgColor('cornflowerblue');

                //Unsubscribe from the topic when dis-engaging from guidance.
                listenerPluginAvailability.unsubscribe();
        }
    });

}


/*
 Check for availability when Guidance is enabled
*/
function checkAvailability()
{
    //Subscribing to a Topic
    listenerPluginAvailability = new ROSLIB.Topic({
        ros: ros,
        name: top_ns +  '/plugins/available_plugins',
        messageType: 'cav_msgs/PluginList'
    });

    // Then we add a callback to be called every time a message is published on this topic.
    listenerPluginAvailability.subscribe(function (plugins) {

        //TODO: Discuss if the available_plugins topic logic need to be updated to only return the availbility status of active plugins.
        //TODO: Update to get the plugins and enable based on that list. For now, all activated plugin are marked available.
        setCbSelectedBgColor('#4CAF50');

    });//listener
}

/*
 Open the modal popup.
*/
function showModal(isShow, modalMessage)
{
    var modal = document.getElementById('myModal');
    var span_modal = document.getElementsByClassName("close")[0];

    // When the user clicks on <span> (x), close the modal
    span_modal.onclick = function() {
        modal.style.display = "none";
    }

    if (isShow)
        modal.style.display = "block";
    else
        modal.style.display = "none";

    var modalBody = document.getElementsByClassName("modal-body")[0]; //document.getElementsByClassName('modal-body');
    modalBody.innerHTML = '<p>' + modalMessage + '</p>';
}

/*
    Close the modal popup.
*/
function closeModal()
{
    var modal = document.getElementById('myModal');
    modal.style.display = "none";
}


/*
    Getting a param values:

    ~/max_acceleration_capability
    ~/max_deceleration_capability
    ~/ui/guidance_instructions
    ~/ui/page_refresh_interval
    vehicle_color
    vehicle_height
    vehicle_id
    vehicle_length
    vehicle_make
    vehicle_model
    vehicle_width
    vehicle_year
*/
function getParams()
{

  ros.getParams(function(params) {
    params.forEach(printParam); //Print each param into the log view.
  });

}

/*
 forEach function to print the parameter listing.
*/
function printParam(item, index) {
    //demoP.innerHTML = demoP.innerHTML + "index[" + index + "]: " + item + "<br>";
    if (item.startsWith("/ros")==false)
    {


       //Sample call to get param.
       var myParam = new ROSLIB.Param({
         ros : ros,
         name : item
       });

       myParam.get(function(value) {
            document.getElementById('divLog').innerHTML += '<br/> Param index[' + index + ']: ' + item + ': value: ' + value + '.';

            if (item == '/ui/guidance_instructions' && value != null)
                 host_instructions=value;
       });
    }


}

/*
    Subscribe to future topics below:

    nav_sat_fix
    route_current_segment
    ui_instructions
    ui_platoon_vehicle_info


    TODO: For future iterations.
*/
function getFutureTopics()
{

  var listenerNavSatFix = new ROSLIB.Topic({
    ros : ros,
    name : '/nav_sat_fix',
    messageType : 'sensor_msgs/NavSatFix'
  });

  listenerNavSatFix.subscribe(function(message) {
     document.getElementById('divLog').innerHTML += '<br/> System received message from ' + listenerNavSatFix.name + ': ' + message.status;
     //listenerNavSatFix.unsubscribe();
  });

  var listenerRouteSegment = new ROSLIB.Topic({
    ros : ros,
    name : '/route_current_segment',
    messageType : 'cav_msgs/RouteSegment'
  });

  listenerRouteSegment.subscribe(function(message) {
     document.getElementById('divLog').innerHTML += '<br/> System received message from ' + listenerRouteSegment.name + ': ' + message.length;
     //listenerRouteSegment.unsubscribe();
  });

  //TODO: Not yet published by Guidance.
  var listenerUiInstructions = new ROSLIB.Topic({
    ros : ros,
    name : '/ui_instructions',
    messageType :'std_msgs/String'
  });

  listenerUiInstructions.subscribe(function(message) {
     document.getElementById('divLog').innerHTML += '<br/> System received message from ' + listenerUiInstructions.name + ': ' + message.data;
     //listenerUiInstructions.unsubscribe();
  });

  //TODO: Not yet published by Guidance.
  var listenerUiPlatoonInfo = new ROSLIB.Topic({
      ros : ros,
      name : '/ui_platoon_vehicle_info',
      messageType :'std_msgs/String'
    });

    listenerUiPlatoonInfo.subscribe(function(message) {
       document.getElementById('divLog').innerHTML += '<br/> System received message from ' + listenerUiPlatoonInfo.name + ': ' + message.data;
       //listenerUiPlatoonInfo.unsubscribe();
    });

}


/*
  Loop function to wait for System Ready status from interface manager.
*/
function waitForSystemReady () {
   setTimeout( function ()
                {                                                               //  call a 5s setTimeout when the loop is called
                  checkSystemAlerts();                                          //  check here
                   ready_counter++;                                              //  increment the counter

                  if (ready_counter < ready_max_trial && system_ready == false) {            //  if the counter < 4, call the loop function
                     waitForSystemReady();             //  ..  again which will trigger another
                     divCapabilitiesMessage.innerHTML = '<p> Awaiting SYSTEM READY status ... </p>';
                  }

                  if (system_ready==true)
                  {
                      showRouteOptions();
                      enableGuidance();
                      getParams();
                      getFutureTopics();
                  }
                  else
                  {
                     if (ready_counter >= ready_max_trial)
                        divCapabilitiesMessage.innerHTML = '<p> Sorry, did not receive SYSTEM READY status, please refresh your browser to try again. </p>';
                  }
                }, 5000)//  ..  setTimeout()
}

/*
 Onload function that gets called on page refresh.
*/
window.onload = function () {
    connectToROS();
    waitForSystemReady ();

}

// When the user clicks anywhere outside of the modal, close it
window.onclick = function(event) {
    var modal = document.getElementById('myModal');

    if (event.target == modal) {
        modal.style.display = "none";
    }
}