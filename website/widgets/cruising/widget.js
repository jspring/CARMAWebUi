/***
* Create a unique namespace for each plugin widget to minimize collision of same name variables or functions.
***/
CarmaJS.registerNamespace("CarmaJS.WidgetFramework.Cruising");

CarmaJS.WidgetFramework.Cruising = (function () {

        //*** Private Variables ***
        // var variable_name = 0;
        var total_dist_next_speed_limit = 0;

        //*** Widget Install Folder ***
        //Currently the URL path from document or window are pointing to the page, not the actual folder location.
        //Therefore this needs to be hardcoded.
        //TODO: However, this could be set by widgetfw based on final install folder naming convention.
        var installfoldername = 'widgets/cruising/';

        //*** Functions ***

        /***
        * Listen to route state to determine current, total, target lanes.
        * Assumes that ROSLIB object has been initalized.
        ***/
        var checkRouteState = function () {

            //Get Route State
            var listenerRouteState = new ROSLIB.Topic({
                ros: ros,
                name: t_route_state,
                messageType: 'cav_msgs/RouteState'
            });

            listenerRouteState.subscribe(function (message) {

                if (message.current_segment.waypoint.speed_limit != null && message.current_segment.waypoint.speed_limit != 'undefined')
                    document.getElementById('divSpeedLimitValue').innerHTML = message.current_segment.waypoint.speed_limit;

                //Calculate and show next speed limit remaining distance
                //Show 0 if negative
                var remaining_dist = total_dist_next_speed_limit - message.down_track;
                remaining_dist = Math.max(0, remaining_dist);
                var remaining_dist_miles = (remaining_dist * meter_to_mile);
                remaining_dist_miles = Math.max(0, remaining_dist_miles);

                insertNewTableRow('tblSecondA', 'Speed Limit Change Total Dist (m)', total_dist_next_speed_limit.toFixed(2));
                insertNewTableRow('tblSecondA', 'Speed Limit Change In (mi/m)', remaining_dist_miles.toFixed(2) + ' mi / ' + remaining_dist.toFixed(0) + ' m');

                var divSLDistRemaining = document.getElementById('divSLDistRemaining');
                divSLDistRemaining.innerHTML = 'Speed Limit Change In: ' + remaining_dist_miles.toFixed(2) + ' mi / ' + remaining_dist.toFixed(0) + ' m';

                //Determine the remaining distance to current speed limit
                if (sessionStorage.getItem('routeSpeedLimitDist') != null) {
                    var routeSpeedLimitDist = sessionStorage.getItem('routeSpeedLimitDist');
                    routeSpeedLimitDist = JSON.parse(routeSpeedLimitDist);

                    //Loop thru to find the correct totaldistance
                    for (i = 0; i < routeSpeedLimitDist.length; i++) {
                        if (message.current_segment.waypoint.waypoint_id <= routeSpeedLimitDist[i].waypoint_id) {
                            total_dist_next_speed_limit = routeSpeedLimitDist[i].total_length;
                            break;
                        }
                    }
                    //insertNewTableRow('tblSecondA', 'total_dist_next_speed_limit', total_dist_next_speed_limit);
                }
            });
        };

        /*
            Watch out for route completed, and display the Route State in the System Status tab.
            Route state are only set and can be shown after Route has been selected.
        */
        var showActiveRoute = function () {

            //Get Route State
            var listenerRoute = new ROSLIB.Topic({
                ros: ros,
                name: t_active_route,
                messageType: 'cav_msgs/Route'
            });

            listenerRoute.subscribe(function (message) {

                //If nothing on the list, set all selected checkboxes back to blue (or active).
                if (message.segments == null || message.segments.length == 0) {
                    return;
                }

                //alert('showActive Route: sessionStorage.getItem(routeSpeedLimitDist: ' + sessionStorage.getItem('routeSpeedLimitDist'));
                if (sessionStorage.getItem('routeSpeedLimitDist') == null) {
                    message.segments.forEach(this.calculateDistToNextSpeedLimit);
                }

            });
        };


        /*
            Calculate the next distance to next speed limit.
        */
        var calculateDistToNextSpeedLimit = function (segment) {

            if (segment == null)
            {
                //console.log('**** calculateDistToNextSpeedLimit: segment is null.');
                return;
            }

            if (segment.length <= 0 || segment.length == null || segment.length == 'undefined')
            {
                //console.log('**** calculateDistToNextSpeedLimit: segment is null.');
                return;
            }

            //To calculate the distance to next speed limit
            var routeSpeedLimit; //To store the total distance for each speed limit change.
            var routeSpeedLimitDist;

            if (sessionStorage.getItem('routeSpeedLimitDist') == null) {
                routeSpeedLimit = { waypoint_id: segment.prev_waypoint.waypoint_id, total_length: segment.length, speed_limit: segment.prev_waypoint.speed_limit };
                routeSpeedLimitDist = [];
                routeSpeedLimitDist.push(routeSpeedLimit);

                sessionStorage.setItem('routeSpeedLimitDist', JSON.stringify(routeSpeedLimitDist));
            }
            else {

                routeSpeedLimitDist = sessionStorage.getItem('routeSpeedLimitDist');
                routeSpeedLimitDist = JSON.parse(routeSpeedLimitDist);

                var lastItem = routeSpeedLimitDist[routeSpeedLimitDist.length - 1];

                //If speed limit changes, add to list
                if (lastItem.speed_limit != segment.waypoint.speed_limit) {
                    routeSpeedLimit = {
                        waypoint_id: segment.waypoint.waypoint_id
                        , total_length: (lastItem.total_length + segment.length) //make this a running total for every speed limit change
                        , speed_limit: segment.waypoint.speed_limit
                    };
                    routeSpeedLimitDist.push(routeSpeedLimit);

                    sessionStorage.setItem('routeSpeedLimitDist', JSON.stringify(routeSpeedLimitDist));
                }
                else //Update last item's length to the total length
                {

                    lastItem.waypoint_id = segment.waypoint.waypoint_id;
                    lastItem.total_length += segment.length;

                    sessionStorage.setItem('routeSpeedLimitDist', JSON.stringify(routeSpeedLimitDist));

                }
            }
        };

        /***
        *    Display the close loop control of speed
        ***/
        var showSpeedAccelInfo = function () {

            //Get Speed Accell Info
            var listenerSpeedAccel = new ROSLIB.Topic({
                ros: ros,
                name: t_cmd_speed,
                messageType: 'cav_msgs/SpeedAccel'
            });

            listenerSpeedAccel.subscribe(function (message) {

                var cmd_speed_mph = Math.round(message.speed * meter_to_mph);

                //Display on DriverView the Speed Cmd for Speed Harm or Cruising
                //NOTE: There is currently no indicator to know if SpeedHarm is transmitting.
                if (message.speed != null && message.speed != 'undefined')
                    document.getElementById('divSpeedCmdValue').innerHTML = cmd_speed_mph;
            });
        };

        /*
            Set the values of the speedometer
        */
        var setSpeedometer = function (speed) {
            var maxMPH = 160;
            var deg = (speed / maxMPH) * 180;
            document.getElementById('percent').innerHTML = speed;
            var element = document.getElementsByClassName('gauge-c')[0];

            element.style.webkitTransform = 'rotate(' + deg + 'deg)';
            element.style.mozTransform = 'rotate(' + deg + 'deg)';
            element.style.msTransform = 'rotate(' + deg + 'deg)';
            element.style.oTransform = 'rotate(' + deg + 'deg)';
            element.style.transform = 'rotate(' + deg + 'deg)';
        };

        /*
            Display the CAN speeds
        */
        var showCANSpeeds = function () {

            var listenerCANSpeed = new ROSLIB.Topic({
                ros: ros,
                name: t_can_speed,
                messageType: 'std_msgs/Float64'
            });

            listenerCANSpeed.subscribe(function (message) {
                var speedMPH = Math.round(message.data * meter_to_mph);
                setSpeedometer(speedMPH);
            });
        };

        /***
        * Custom widgets using JQuery Widget Framework.
        * NOTE: that widget framework namespace can only be one level deep.
        * This should not colide with other widgets as loadCustomWidget will be calling private widgets.
        ***/
        $.widget("CarmaJS.cruisingSpeedLimit", {
            _create: function() {
                var myDiv = $("<div id='divSpeedLimit' class='sign-black-border-outer'>"
                            + "     <div class='sign-black-border-inner'>"
                            + "         <div class='sign-black-border-title'>SPEED LIMIT</div>"
                            + "         <div id='divSpeedLimitValue' class='sign-black-border-value'>0</div>"
                            + "     </div>"
                            + "</div>"
                            + "<div id='divSLDistRemaining'></div>");

                //this._div = $("<button>");
                $(this.element).append(myDiv);
             },
             checkRouteState: function(){
                checkRouteState();
             },
             showActiveRoute: function(){
                showActiveRoute();
             }

        });//CarmaJS.cruisingSpeedLimit

        $.widget("CarmaJS.cruisingSpeedCmd", {
            _create: function() {
                var myDiv = $("<div id='divSpeedCmd' class='sign-black-border-outer'>"
                            + "     <div class='sign-black-border-inner'>"
                            + "         <div class='sign-black-border-title'>SPEED CMD</div>"
                            + "         <div id='divSpeedCmdValue' class='sign-black-border-value'>0</div>"
                            + "     </div>"
                            + "</div>");

                //this._div = $("<button>");
                $(this.element).append(myDiv);
             },
             showSpeedAccelInfo: function(){
                showSpeedAccelInfo();
             }

        });//CarmaJS.cruisingSpeedCmd

        /*
        * Create the speedometer.
        */
        $.widget("CarmaJS.cruisingSpeedometer", {
            _create: function() {
                var myDiv = $("<div class='divSpeedometer'>"
                            + "     <div class='gauge-a'></div>"
                            + "     <div class='gauge-b'></div>"
                            + "     <div class='gauge-c'></div>"
                            + "     <div class='gauge-data'><h1 id='percent'>0</h1><br>MPH</div>"
                            + "</div>");

                $(this.element).append(myDiv);
             },
             showCANSpeeds: function(){
                showCANSpeeds();
             },
             setSpeedometer: function(val){
                setSpeedometer(val);
             }
        });//CarmaJS.cruisingSpeedometer

        /*** Public Functions ***
        This is the public function call to setup the different widgets available in this plugin.
        ***/
        var loadCustomWidget = function(container) {

            //Generate the  widget and calling its private method(s) below.
            container.cruisingSpeedLimit();
            container.cruisingSpeedLimit("checkRouteState", null);

            container.cruisingSpeedCmd();
            container.cruisingSpeedCmd("showSpeedAccelInfo", null);

            container.cruisingSpeedometer();
            container.cruisingSpeedometer("showCANSpeeds", null);
        };

        var onRouteSelection = function(){
            //After route selection
            //container.cruisingSpeedLimit();
            //container.cruisingSpeedLimit("showActiveRoute", null);
            showActiveRoute();
        };

        var closeWidget = function(){
            //container.cruisingSpeedometer("setSpeedometer", 0);
            setSpeedometer(0);
            if (document.getElementById('divSpeedCmdValue') != null)
                document.getElementById('divSpeedCmdValue').innerHTML = '0';
        };

        //*** Public API  ***
        return {
            loadCustomWidget: loadCustomWidget,
            onRouteSelection: onRouteSelection,
            closeWidget: closeWidget
        };

})(); //CarmaJS.WidgetFramework.Cruising