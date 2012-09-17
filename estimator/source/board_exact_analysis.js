//BoardExactAnalysis
//Analyse a board by computing exact information: dame, eyes for sure, etc
//v0.4.0

/** History
0.1.0: creation of this file
0.2.0: findDame
0.3.0: initGroups, findConnections, lookForSimpleEyeOrKo
0.4.0: findAtariCapturedForSure, checkForEyes
*/


/**
Constructor
Inherits from ScoreBoard
board param: a square double array like board = [size][size];
*/
function BoardExactAnalysis(board, komi, black_captures, white_captures) {
	this._base_BoardExactAnalysis.call(this, board, komi, black_captures, white_captures);//call parent constructor

	this.groupNames = new Object();//this.groupNames[ScoreBoard.getKey(i, j)] contains the name of the group at (i,j), name begins with FindGroups.GROUP_PREFIX_BLACK for black, etc
	this.groupCoords = new Object();//this.groupCoords[groupName] contains a simple array with the coords of the group
	this.groupLibCoords = new Object();//this.groupLibCoords[groupName] contains a simple array with the coords of the liberties of the group
	this.groupNeighbors = new Object();//this.groupNeighbors[groupName] contains a map with the names of the neighbor of the group
	this.metagroupName = new Object();//this.metagroupName[groupName] contains the name of the meta-group (parent group of groups, name begins with BoardExactAnalysis.PREFIX_METAGROUP) of the group
	this.metagroupCount = 0;//number of meta-groups already created
	this.metagroupChilds = new Object();//this.metagroupChilds[metaGroupName] contains an array with the names of the contained groups (children) of the meta-group
	this.metagroupProperties = new Object();//this.metagroupProperties[metaGroupName] contains an object with properties (e.g. BoardExactAnalysis.PROPERTY_METAGROUP_HAS_ONE_EYE)
	this.territoryCoordProps = new Object();//this.territoryCoordProps[ScoreBoard.getKey(i, j)] contains an object with properties (e.g. BoardExactAnalysis.PROPERTY_TERRITORY_IS_SEPARATOR)

	this.mapForCheckMultipleEyes = new Object();
	
	this.initGroups();
}

extendClass(BoardExactAnalysis, ScoreBoard);//define inheritance, cf inheritance.js

/** group properties */
BoardExactAnalysis.PROPERTY_METAGROUP_HAS_ONE_EYE = "EYE";//value=territory group name
BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE = "ALIVE";
BoardExactAnalysis.PROPERTY_METAGROUP_IS_DEAD = "DEAD";
BoardExactAnalysis.PROPERTY_METAGROUP_IS_SEKI = "SEKI";
BoardExactAnalysis.PROPERTY_METAGROUP_COLOR = "COLOR";
BoardExactAnalysis.PROPERTY_METAGROUP_IS_TERRITORY_MARKED = "MARKED";//handled, do not need extra analysis

/** territory coords properties */
BoardExactAnalysis.PROPERTY_TERRITORY_IS_SEPARATOR = "SEPARATOR";
BoardExactAnalysis.PROPERTY_TERRITORY_IS_EYE = "EYE";

BoardExactAnalysis.PREFIX_METAGROUP = "M";


/** 
scoreboard param: a ScoreBoard object
return: a double-array board filled with ScoreBoard constants (like ScoreBoard.TERRITORY_BLACK etc)
 */
//static
BoardExactAnalysis.launchAnalysis  = function(scoreboard) {
	var boardAnalysis = new BoardExactAnalysis(scoreboard.getBoardArray());
	boardAnalysis.computeAnalysis();
	return boardAnalysis.getBoardArray();
};


//static private, utility
BoardExactAnalysis.addNewValueToArray = function(array, value) {
	for(var i=0; i<array.length; i++) {
		if(array[i] == value) {
			return;
		}
	}
	array.push(value);
};


/**
return ScoreBoard.BLACK if black, ScoreBoard.WHITE if white, or null if territory
*/
//static
BoardExactAnalysis.getGroupColor = function(groupName) {
	var prefix = groupName.substring(0,1);
	if(prefix == FindGroups.GROUP_PREFIX_BLACK) {
		return ScoreBoard.BLACK;
	} else if(prefix == FindGroups.GROUP_PREFIX_WHITE) {
		return ScoreBoard.WHITE;
	} else {
		return null;
	}	
};


BoardExactAnalysis.isTerritory  = function(groupName) {
	return (BoardExactAnalysis.getGroupColor(groupName) == null);
};



/**
return a BoardExactAnalysis copy
*/
BoardExactAnalysis.prototype.clone  = function() {

	return new BoardExactAnalysis(this.board, this.komi, this.black_captures, this.white_captures);
};


BoardExactAnalysis.prototype.computeAnalysis  = function() {
	this.findDame(false);
	this.lookForSimpleEyeOrKo();
	this.findAtariCapturedForSure();
	this.findConnections();
	this.checkForEyes();

};


//private
BoardExactAnalysis.prototype.initGroupProperties = function(groupName) {
	this.groupCoords[groupName] = new Array();
	this.groupLibCoords[groupName] = new Array();
	this.groupNeighbors[groupName] = new Object();
	var metaGroupName = BoardExactAnalysis.PREFIX_METAGROUP + this.metagroupCount++;
	this.metagroupName[groupName] = metaGroupName;
	this.metagroupChilds[metaGroupName] = new Array();
	this.metagroupChilds[metaGroupName].push(groupName);
	this.metagroupProperties[metaGroupName] = new Object();
	this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_HAS_ONE_EYE] = null;

};

//private
BoardExactAnalysis.prototype.initMetaGroupProps = function(groupName, i, j) {
	var metaGroupName = this.metagroupName[groupName];
	var kind = this.getBoardKindAt(i, j);
	var color = ScoreBoard.getBlackOrWhite(kind);
	this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_COLOR] = color;
	if(color == null) {//territory
		return;
	}
	if(kind == ScoreBoard.BLACK_DEAD || kind == ScoreBoard.WHITE_DEAD) {
		this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_IS_DEAD] = true;
	} else if(kind == ScoreBoard.BLACK_ALIVE || kind == ScoreBoard.WHITE_ALIVE) {
		this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE] = true;
	} else if(kind == ScoreBoard.BLACK_SEKI || kind == ScoreBoard.WHITE_SEKI) {
		this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_IS_SEKI] = true;
	}
};


/**
set meta-group property
*/
BoardExactAnalysis.prototype.isSameMetaGroup = function(groupName1, groupName2) {
	var metaGroupName1 = this.metagroupName[groupName1];
	var metaGroupName2 = this.metagroupName[groupName2];
	return (metaGroupName1 == metaGroupName2);
};


/**
set meta-group property
*/
BoardExactAnalysis.prototype.setMetaGroupProp = function(groupName, prop, value) {
	var metaGroupName = this.metagroupName[groupName];
	this.metagroupProperties[metaGroupName][prop] = value;
};

/**
get meta-group property
*/
BoardExactAnalysis.prototype.getMetaGroupProp = function(groupName, prop) {
	var metaGroupName = this.metagroupName[groupName];
	return this.metagroupProperties[metaGroupName][prop];
};


/**
used by tests
*/
BoardExactAnalysis.prototype.getTerritoryPropAt = function(i, j, prop) {
	return this.territoryCoordProps[ScoreBoard.getKey(i, j)][prop];
};


BoardExactAnalysis.prototype.isGroupDead = function(groupName) {
	var metaGroupName = this.metagroupName[groupName];
	return (this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_IS_DEAD] == true);
};


BoardExactAnalysis.prototype.isGroupAlive = function(groupName) {
	var metaGroupName = this.metagroupName[groupName];
	return (this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE] == true);
};


BoardExactAnalysis.prototype.getGroupSize = function(groupName) {
	return (this.groupCoords[groupName].length)/2;
};


BoardExactAnalysis.prototype.countNeighbors = function(groupName) {
	var count = 0;
	for(var neighbor in this.groupNeighbors[groupName]) {
		count++;
	}
	return count;
};


//private
BoardExactAnalysis.prototype.initGroups = function() {
	var findGroups = new FindGroups(this.board);
	var groupsBoard = findGroups.getBoardArray();
	var alreadySeenThatGroup = new Object();

	for(var i=0;i<this.size;i++) {
		for(var j=0;j<this.size;j++) {
			var groupName = groupsBoard[i][j];
			if(alreadySeenThatGroup[groupName] != true) {
				this.initGroupProperties(groupName);
				alreadySeenThatGroup[groupName] = true;
			}
			this.initMetaGroupProps(groupName, i, j);
			this.groupNames[ScoreBoard.getKey(i, j)] = groupName;
			this.groupCoords[groupName].push(i);
			this.groupCoords[groupName].push(j);
			var isTerritory = BoardExactAnalysis.isTerritory(groupName);
			if(isTerritory) {
				this.territoryCoordProps[ScoreBoard.getKey(i, j)] = new Object();
				var alreadySeenThatOtherGroup = new Object();
				for(var k=0; k < ScoreBoard.DISTANCE1.length;) {
					var ii = i+ScoreBoard.DISTANCE1[k++];
					var jj = j+ScoreBoard.DISTANCE1[k++];
					if(!this.isInBoard(ii, jj)) {
						continue; 
					}
					var otherGroupName = groupsBoard[ii][jj];
					if(otherGroupName == groupName) {
						continue;
					}
					if(alreadySeenThatOtherGroup[otherGroupName] == true) {
						continue;
					} else {
						alreadySeenThatOtherGroup[otherGroupName] = true;
					}
					if(alreadySeenThatGroup[otherGroupName] != true) {
						this.initGroupProperties(otherGroupName);
						alreadySeenThatGroup[otherGroupName] = true;
					}
					this.groupLibCoords[otherGroupName].push(i);
					this.groupLibCoords[otherGroupName].push(j);
				}
			}
			for(var k=0; k < ScoreBoard.DISTANCE1.length;) {
				var ii = i+ScoreBoard.DISTANCE1[k++];
				var jj = j+ScoreBoard.DISTANCE1[k++];
				if(!this.isInBoard(ii, jj)) {
					continue; 
				}
				var otherGroupName = groupsBoard[ii][jj];
				if(otherGroupName == groupName) {
					continue;
				}
				this.groupNeighbors[groupName][otherGroupName] = true;
				if(!isTerritory) {
					//groups next to marked-as-dead group are alive
					var otherKind = this.getBoardKindAt(ii, jj);
					if(otherKind == ScoreBoard.BLACK_DEAD || otherKind == ScoreBoard.WHITE_DEAD) {
						if(this.getMetaGroupProp(groupName, BoardExactAnalysis.PROPERTY_METAGROUP_IS_DEAD) != true) {//maybe marked dead by the user
							this.setMetaGroupProp(groupName, BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE, true);
						}
					}
				}
			}
		}
	}
};



/**
change the content of the board (for example newKind = ScoreBoard.TERRITORY_BLACK) 
*/
BoardExactAnalysis.prototype.changeBoardAt = function(i, j, newKind) {
	this.board[i][j] = newKind;
};


/**
override ScoreBoard.prototype.getGroupStatusAt 
*/
BoardExactAnalysis.prototype.getGroupNameAt = function(i, j) {
	return this.groupNames[ScoreBoard.getKey(i, j)];
};


/**
override ScoreBoard.prototype.getGroupStatusAt, no parent call, rely entirely on meta-group properties
*/
BoardExactAnalysis.prototype.getGroupStatusAt = function(i, j) {
	var groupName = this.getGroupNameAt(i, j);
	if(this.getMetaGroupProp(groupName, BoardExactAnalysis.PROPERTY_METAGROUP_IS_DEAD) == true) {
		return ScoreBoard.STATUS_GROUP_DEAD;
	} else if(this.getMetaGroupProp(groupName, BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE) == true) {
		return ScoreBoard.STATUS_GROUP_ALIVE;
	} else if(this.getMetaGroupProp(groupName, BoardExactAnalysis.PROPERTY_METAGROUP_IS_SEKI) == true) {
		return ScoreBoard.STATUS_GROUP_SEKI;
	} else {
		return ScoreBoard.STATUS_GROUP_UNKNOWN;
	}

};


/**
return true if in atari, false otherwise
*/
BoardExactAnalysis.prototype.isGroupInAtari = function(groupName) {
	return (this.groupLibCoords[groupName].length < 4);
};


/**
return true if (i,j) is next to a non-dead color group.
if onlyIfGroupIsAlive == true, both groups must be known as alive
*/
BoardExactAnalysis.prototype.isNextToAliveColor = function(i, j, color, onlyIfGroupIsAlive) {
	for(var k=0; k < ScoreBoard.DISTANCE1.length;) {
		var ii = i+ScoreBoard.DISTANCE1[k++];
		var jj = j+ScoreBoard.DISTANCE1[k++];
		if(!this.isInBoard(ii, jj)) {
			continue; 
		}
		if(!this.isSameColorAt(ii, jj, color)) {
			continue;
		}
		var status = this.getGroupStatusAt(ii, jj);
		if(status == ScoreBoard.STATUS_GROUP_ALIVE || status == ScoreBoard.STATUS_GROUP_SEKI) {
			return true;
		}
		if(!onlyIfGroupIsAlive && status == ScoreBoard.STATUS_GROUP_UNKNOWN) {
			return true;
		}
	}
	return false;
};


/**
change board kind to ScoreBoard.TERRITORY_DAME if relevant
*/
BoardExactAnalysis.prototype.findDameAt = function(i, j, onlyIfGroupsAreAlive) {
	if(this.isNextToAliveColor(i, j, ScoreBoard.BLACK, onlyIfGroupsAreAlive) && this.isNextToAliveColor(i, j, ScoreBoard.WHITE, onlyIfGroupsAreAlive)) {
		this.changeBoardAt(i, j, ScoreBoard.TERRITORY_DAME);
	}
};


/**
search territories next to non-dead groups of both colors. 
if onlyIfGroupsAreAlive == true, both groups must be known as alive
found territories are marked as ScoreBoard.TERRITORY_DAME
*/
BoardExactAnalysis.prototype.findDame  = function(onlyIfGroupsAreAlive) {
	for(var groupName in this.groupCoords) {
		if( !(BoardExactAnalysis.isTerritory(groupName))) {
			continue;
		}
		var arr = this.groupCoords[groupName];
		for(var k=0; k < arr.length;) {
			var i = arr[k++];
			var j = arr[k++];
			this.findDameAt(i, j, onlyIfGroupsAreAlive);
		}
	}
};


/**
two groups of the same color with two common libs are connected. 
three groups of the same color, not in atari and with one common lib, no other color near the lib, are connected.
*/
BoardExactAnalysis.prototype.findConnections = function() {
	//get name of all meta-groups (not territories)
	var metaGroupNames = new Array();
	for(var metaGroupName in this.metagroupProperties) {
		if(this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_COLOR] == null) {//territory
			continue;
		}
		metaGroupNames.push(metaGroupName);
	}
	for(var m1=0; m1<metaGroupNames.length-1; m1++) {
		var metaGroupName1 = metaGroupNames[m1];
		//create a map of the libs coords to match them more easily
		var coordMap = new Object();
		for(var c1=0; c1<this.metagroupChilds[metaGroupName1].length; c1++) {
			var groupName = this.metagroupChilds[metaGroupName1][c1];
			for(var k=0; k<this.groupLibCoords[groupName].length;) {
				var ii = this.groupLibCoords[groupName][k++];
				var jj = this.groupLibCoords[groupName][k++];
				coordMap[ScoreBoard.getKey(ii, jj)] = true;
			}
		}
		//compare coords with all other meta-groups
		for(var m2=m1+1; m2<metaGroupNames.length; m2++) {
			var metaGroupName2 = metaGroupNames[m2];
			//connect only if same color
			if(this.metagroupProperties[metaGroupName1][BoardExactAnalysis.PROPERTY_METAGROUP_COLOR] != this.metagroupProperties[metaGroupName2][BoardExactAnalysis.PROPERTY_METAGROUP_COLOR]) {
				continue;
			}
			//compare coords
			var libInCommon = null;
			for(var c2=0; c2<this.metagroupChilds[metaGroupName2].length; c2++) {
				var groupName = this.metagroupChilds[metaGroupName2][c2];
				for(var k=0; k<this.groupLibCoords[groupName].length;) {
					var ii = this.groupLibCoords[groupName][k++];
					var jj = this.groupLibCoords[groupName][k++];
					var key = ScoreBoard.getKey(ii, jj);
					if(coordMap[key] == true) {
						if(libInCommon != null && libInCommon != key) {//two libs in common
							this.mergeMetaGroups(metaGroupName2, metaGroupName1);
							libInCommon = null;//no need to check for more connection later
							break;
						}
						libInCommon = key;
					}
				}
			}
			if(libInCommon != null) {//only one lib in common
				var ar = ScoreBoard.getCoordFromKey(libInCommon);
				this.findConnection3(ar[0], ar[1]);
			}
		}
	}
};


/**
(i, j) corresponds to a territory
if this territory is surrounded by 3 or 4 stones of the same color, no stone of the other color, and that all those stones belong to groups not in atari, then all those groups are connected
*/
BoardExactAnalysis.prototype.findConnection3 = function(i, j) {
	var territoryKind = this.getBoardKindAt(i,j);
	if(territoryKind != ScoreBoard.TERRITORY_UNKNOWN) {//skip if not territory or already analysed 
		return;
	}
	var color;
	var groupNames = new Array();
	var countStones = 0;
	for(var k=0; k < ScoreBoard.DISTANCE1.length;) {
		var ii = i+ScoreBoard.DISTANCE1[k++];
		var jj = j+ScoreBoard.DISTANCE1[k++];
		if(!this.isInBoard(ii, jj)) {
			countStones++;//allow connection between two groups near border
			continue; 
		}
		var kind = this.getBoardKindAt(ii,jj);
		var c = ScoreBoard.getBlackOrWhite(kind);
		if(c == null) {//territory
			continue;
		}
		if(color == null) {
			color = c;
		} else if (color != c) {//two different colors: don't match
			return;
		}
		countStones++;
		var groupName = this.getGroupNameAt(ii, jj);
		if(this.isGroupInAtari(groupName)) {//in atari: don't match
			return;
		}
		//add group name to groupNames
		BoardExactAnalysis.addNewValueToArray(groupNames, groupName);
	}
	if(countStones != 3 && countStones != 4) {
		return;
	}
	if(groupNames.length < 2) {
		return;
	}
	//merge all groups
	var metaGroupName = this.metagroupName[groupNames[0]];
	for(var k=1; k<groupNames.length; k++) {
		this.mergeMetaGroups(metaGroupName, this.metagroupName[groupNames[k]]);
	}
	//mark territory
	var newKind;
	if(color == ScoreBoard.BLACK) {
		newKind = ScoreBoard.TERRITORY_BLACK;
	} else {
		newKind = ScoreBoard.TERRITORY_WHITE;
	}
	this.changeBoardAt(i, j, newKind);
};


/**
merge meta-groups
metaGroupName2 properties and children are copied into metaGroupName1
*/
BoardExactAnalysis.prototype.mergeMetaGroups = function(metaGroupName1, metaGroupName2) {
	if(metaGroupName1 == metaGroupName2) {
		return;
	}
	//do not merge if not same color
	if(this.metagroupProperties[metaGroupName1][BoardExactAnalysis.PROPERTY_METAGROUP_COLOR] != this.metagroupProperties[metaGroupName2][BoardExactAnalysis.PROPERTY_METAGROUP_COLOR]) {
		return;
	}
	
	//do not merge groups marked as dead and alive
	if(this.metagroupProperties[metaGroupName1][BoardExactAnalysis.PROPERTY_METAGROUP_IS_DEAD] == true 
				&& this.metagroupProperties[metaGroupName2][BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE] == true) {
		return;
	}
	if(this.metagroupProperties[metaGroupName2][BoardExactAnalysis.PROPERTY_METAGROUP_IS_DEAD] == true 
				&& this.metagroupProperties[metaGroupName1][BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE] == true) {
		return;
	}

	//BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE
	if(this.metagroupProperties[metaGroupName1][BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE] != true) {
		if(this.metagroupProperties[metaGroupName2][BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE] == true) {
			this.metagroupProperties[metaGroupName1][BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE] = true;
		} else if(this.metagroupProperties[metaGroupName1][BoardExactAnalysis.PROPERTY_METAGROUP_HAS_ONE_EYE] != null
					&& this.metagroupProperties[metaGroupName2][BoardExactAnalysis.PROPERTY_METAGROUP_HAS_ONE_EYE] != null) {
			this.metagroupProperties[metaGroupName1][BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE] = true;			
		}
	}

	//BoardExactAnalysis.PROPERTY_METAGROUP_IS_DEAD	
	if(this.metagroupProperties[metaGroupName2][BoardExactAnalysis.PROPERTY_METAGROUP_IS_DEAD] == true) {
		this.metagroupProperties[metaGroupName1][BoardExactAnalysis.PROPERTY_METAGROUP_IS_DEAD] = true;
	}

	//BoardExactAnalysis.PROPERTY_METAGROUP_HAS_ONE_EYE
	var hasOneEyeProp = this.metagroupProperties[metaGroupName2][BoardExactAnalysis.PROPERTY_METAGROUP_HAS_ONE_EYE];
	if(hasOneEyeProp != null) {
		this.addOneEye(metaGroupName1, hasOneEyeProp);
	}

	//merge group childs
	for(var i=0; i<this.metagroupChilds[metaGroupName2].length; i++) {
		var groupName = this.metagroupChilds[metaGroupName2][i];
		this.metagroupChilds[metaGroupName1].push(groupName);
		this.metagroupName[groupName] = metaGroupName1;
	}
	this.metagroupChilds[metaGroupName2] = new Array();

};


/**
eye is a ScoreBoard.getKey(i, j)
if new eye, add it
if two eyes and not dead, then alive
*/
BoardExactAnalysis.prototype.addOneEye = function(metaGroupName, eye) {
	if(this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_IS_DEAD] == true) {
		return;
	}

	var hasOneEyeProp = this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_HAS_ONE_EYE];
	if(hasOneEyeProp != null && hasOneEyeProp != eye) {
		this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE] = true;
	} else if(hasOneEyeProp == null) {
		this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_HAS_ONE_EYE] = eye;
	}
};


/**
mark territory as color
*/
BoardExactAnalysis.prototype.markTerritory = function(territoryGroupName, color) {
	var territoryCoords = this.groupCoords[territoryGroupName];
	var newKind;
	if(color == ScoreBoard.BLACK) {
		newKind = ScoreBoard.TERRITORY_BLACK;
	} else if(color == ScoreBoard.WHITE) {
		newKind = ScoreBoard.TERRITORY_WHITE;
	}
	for(var k=0; k<territoryCoords.length;) {
		var i = territoryCoords[k++];
		var j = territoryCoords[k++];
		this.changeBoardAt(i, j, newKind);
	}
	this.setMetaGroupProp(territoryGroupName, BoardExactAnalysis.PROPERTY_METAGROUP_IS_TERRITORY_MARKED, true);
};


/**
(i, j) corresponds to a territory
if this territory is surrounded by 4 stones of the same color:
- if only one group in atari, then ko
- if no group in atari, check if a simple eye
*/
BoardExactAnalysis.prototype.checkForSimpleEyeOrKo = function(i, j) {
	var territoryKind = this.getBoardKindAt(i,j);
	if(territoryKind != ScoreBoard.TERRITORY_UNKNOWN && territoryKind != ScoreBoard.TERRITORY_BLACK && territoryKind != ScoreBoard.TERRITORY_WHITE) {//skip if not territory or already analysed 
		return;
	}
	if(this.getMetaGroupProp(this.getGroupNameAt(i, j), BoardExactAnalysis.PROPERTY_METAGROUP_IS_TERRITORY_MARKED) == true) {
		return;
	}
	var color;
	var groupNames = new Array();
	var nearBorder = 0;
	var groupInAtari = null;
	for(var k=0; k < ScoreBoard.DISTANCE1.length;) {
		var ii = i+ScoreBoard.DISTANCE1[k++];
		var jj = j+ScoreBoard.DISTANCE1[k++];
		if(!this.isInBoard(ii, jj)) {
			nearBorder++;//allow connection between two groups near border
			continue; 
		}
		var kind = this.getBoardKindAt(ii,jj);
		var c = ScoreBoard.getBlackOrWhite(kind);
		if(c == null) {//territory
			return;
		}
		if(color == null) {
			color = c;
		} else if (color != c) {//two different colors: don't match
			return;
		}
		var groupName = this.getGroupNameAt(ii, jj);
		if(this.isGroupInAtari(groupName)) {
			if(groupInAtari != null) {//two atari
				return;
			}
			groupInAtari = groupName;
		}
		//add group name to groupNames
		BoardExactAnalysis.addNewValueToArray(groupNames, groupName);
	}
	if(groupInAtari != null) {//ko
		var newKind;
		if(color == ScoreBoard.BLACK) {
			newKind = ScoreBoard.TERRITORY_KO_BLACK;
		} else {
			newKind = ScoreBoard.TERRITORY_KO_WHITE;
		}
		this.changeBoardAt(i, j, newKind);
		this.setMetaGroupProp(this.getGroupNameAt(i, j), BoardExactAnalysis.PROPERTY_METAGROUP_IS_TERRITORY_MARKED, true);
		return;
	}
	
	//now check the square corners around the territory
	//should have no bad color or one bad color and 3 ok color
	//should have less than 2 territories, or 2 but not in diagonal
	var countOkColors = 0;
	var countBadColors = 0;
	var countUnknownTerritories = 0;
	var signOfUnknownTerritories = 1;
	
	var cornerCoords = [-1, -1, -1, 1, 1, -1, 1, 1];
	for(var k=0; k < cornerCoords.length;) {
		var ii = i+cornerCoords[k++];
		var jj = j+cornerCoords[k++];
		if(!this.isInBoard(ii, jj)) {
			countOkColors += 0.5;
			continue;
		}
		var kind = this.getBoardKindAt(ii,jj);
		var c = ScoreBoard.getBlackOrWhite(kind);
		if(c == color) {
			countOkColors++;
		} else if(c == null) {
			if(color == ScoreBoard.BLACK && kind == ScoreBoard.TERRITORY_BLACK) {
				countOkColors++;
			} else if(color == ScoreBoard.WHITE && kind == ScoreBoard.TERRITORY_WHITE) {
				countOkColors++;
			} else {
				countUnknownTerritories++;
				signOfUnknownTerritories *= (ii-i);
				signOfUnknownTerritories *= (jj-j);
			}			
		} else {
			if(color == ScoreBoard.BLACK && kind == ScoreBoard.WHITE_DEAD) {
				countOkColors++;
			} else if(color == ScoreBoard.WHITE && kind == ScoreBoard.BLACK_DEAD) {
				countOkColors++;
			} else {//other case, not handled: if bad color but in atari not ko, then countUnknownTerritories++
				countBadColors++;
			}			
		}
	}
	
	if(countOkColors<2) {
		return;
	}
	if(countBadColors>1 || (countBadColors == 1 &&  countOkColors != 3)) {
		return;
	}
	if(countOkColors == 2 && countUnknownTerritories != 2) {
		return;
	}
	if(countOkColors == 2 && signOfUnknownTerritories == -1) {//countUnknownTerritories == 2, territories should not be in diagonal
		return;
	}

	//congrats, it' an eye!
		
	//merge all groups
	var metaGroupName = this.metagroupName[groupNames[0]];
	this.addOneEye(metaGroupName, ScoreBoard.getKey(i, j));
	for(var k=1; k<groupNames.length; k++) {
		this.mergeMetaGroups(metaGroupName, this.metagroupName[groupNames[k]]);
	}
	//mark territory
	this.territoryCoordProps[ScoreBoard.getKey(i, j)][BoardExactAnalysis.PROPERTY_TERRITORY_IS_EYE] = true;
	this.setMetaGroupProp(this.getGroupNameAt(i, j), BoardExactAnalysis.PROPERTY_METAGROUP_IS_TERRITORY_MARKED, true);
};


/**
call checkForSimpleEyeOrKo for each territory of size == 1
*/
BoardExactAnalysis.prototype.lookForSimpleEyeOrKo = function() {
	for(var groupName in this.groupCoords) {
		if( !(BoardExactAnalysis.isTerritory(groupName))) {
			continue;
		}
		var arr = this.groupCoords[groupName];
		if(arr.length != 2) {//only check territories of size == 1
			continue;
		}
		this.checkForSimpleEyeOrKo(arr[0], arr[1]);
	}
};


/**
groups in atari, not surrounded by atari and if play the lib, still in atari ( (ie the lib belong to only one group of that color and no more than one other territory) -> dead, and near groups are connected
if the group in atari is dead and of size > 1, then it is an eye
*/
BoardExactAnalysis.prototype.findAtariCapturedForSure = function() {
	for(var groupName in this.groupLibCoords) {
		if(BoardExactAnalysis.isTerritory(groupName)) {
			continue;
		}
		if(!this.isGroupInAtari(groupName)) {//only check groups in atari
			continue;
		}
		var metaGroupName = this.metagroupName[groupName];
		if(this.isGroupDead(groupName)) {//already dead
			continue;
		}
		if(this.isGroupAlive(groupName)) {//can't be dead
			continue;
		}
		var notAGoodCandidate = false;
		for(var neighbor in this.groupNeighbors[groupName]) {
			if(BoardExactAnalysis.isTerritory(neighbor)) {
				continue;
			}
			if(this.groupLibCoords[neighbor].length == 2 || this.isGroupDead(neighbor)) {
				notAGoodCandidate = true;
				break;
			}
		}
		if(notAGoodCandidate) {
			continue;
		}
		var color = BoardExactAnalysis.getGroupColor(groupName);
		var i = this.groupLibCoords[groupName][0];
		var j = this.groupLibCoords[groupName][1];
		//check that the lib is not surrounded by other color or more than one territory (except territory marked as color)
		var countTerritories = 0;
		var neighborGroupNames = new Array();
		for(var k=0; k < ScoreBoard.DISTANCE1.length;) {
			var ii = i+ScoreBoard.DISTANCE1[k++];
			var jj = j+ScoreBoard.DISTANCE1[k++];
			if(!this.isInBoard(ii, jj)) {
				continue; 
			}
			var neighborGroupName = this.getGroupNameAt(ii, jj);
			if(neighborGroupName == groupName) {
				continue;
			}
			var kind = this.getBoardKindAt(ii,jj);
			var c = ScoreBoard.getBlackOrWhite(kind);
			if(c == null) {//territory
				if(color == ScoreBoard.BLACK && kind == ScoreBoard.TERRITORY_BLACK) {
					continue;
				} else if(color == ScoreBoard.WHITE && kind == ScoreBoard.TERRITORY_WHITE) {
					continue;
				}
				countTerritories++;
				if(countTerritories>1) {
					notAGoodCandidate = true;
					break;
				}
			} else {
				if(color == null) {
					color = c;
				} else if (color == c) {//same color as candidate: don't match
					notAGoodCandidate = true;
					break;
				}
				BoardExactAnalysis.addNewValueToArray(neighborGroupNames, neighborGroupName);
			}
		}
		if(notAGoodCandidate) {
			continue;
		}
		//check also neighbors of the candidate group
		for(var neighborGroupName in this.groupNeighbors[groupName]) {
			if(BoardExactAnalysis.isTerritory(neighborGroupName)) {
				continue;
			}
			if(this.isGroupInAtari(neighborGroupName)) {//in atari: don't match
				notAGoodCandidate = true;
				break;
			}
			BoardExactAnalysis.addNewValueToArray(neighborGroupNames, neighborGroupName);
		}
		if(notAGoodCandidate) {
			continue;
		}
		
		//mark groupName as dead!
		var metaGroupName = this.metagroupName[groupName];
		this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_IS_DEAD] = true;
		//if group size > 1: it's an eye
		var neighborMetaGroupName = this.metagroupName[neighborGroupNames[0]];
		var coords = this.groupCoords[groupName];
		if(this.getGroupSize(groupName) > 1) {
			this.addOneEye(neighborMetaGroupName, ScoreBoard.getKey(coords[0], coords[1]));			
		}
		//merge all neighbors
		for(var k=1; k<neighborGroupNames.length; k++) {
			this.mergeMetaGroups(neighborMetaGroupName, this.metagroupName[neighborGroupNames[k]]);
		}
	}
};


/**
return the color of surrounding groups, or null if both colors have been found
if territory is surrounded by only dead groups of one color: marked as other color
*/
BoardExactAnalysis.prototype.checkIfTerritoryIsSurroundedOnlyByOneColor = function(territoryGroupName) {
	var color = null;
	var allDeadWhite = null;
	var allDeadBlack = null;

	for(var neighborGroupName in this.groupNeighbors[territoryGroupName]) {
		if(BoardExactAnalysis.isTerritory(neighborGroupName)) {
			continue;
		}
		var c = this.getMetaGroupProp(neighborGroupName, BoardExactAnalysis.PROPERTY_METAGROUP_COLOR);
		var isDead = this.getMetaGroupProp(neighborGroupName, BoardExactAnalysis.PROPERTY_METAGROUP_IS_DEAD);
		if(isDead) {
			if(c == ScoreBoard.BLACK) {
				allDeadWhite = false;
				if(allDeadBlack == null) {
					allDeadBlack = true;
				}
				c = ScoreBoard.WHITE;
			} else if (c == ScoreBoard.WHITE) {
				allDeadBlack = false;
				if(allDeadWhite == null) {
					allDeadWhite = true;
				}
				c = ScoreBoard.BLACK;
			}
		} else {
			if(c == ScoreBoard.BLACK) {
				allDeadBlack = false;
			} else if (c == ScoreBoard.WHITE) {
				allDeadWhite = false;
			}
		}
		if(color == null) {
			color = c;
		}
		if(c == null) {//territory: separators?
			continue;
		}
		if(color != c) {//incompatible colors
			return null;
		}
	}
	if(allDeadWhite || allDeadBlack) {
		this.markTerritory(territoryGroupName, allDeadWhite?ScoreBoard.BLACK:ScoreBoard.WHITE);
		return null;
	}
	return color;
};


/**
if territory surrounded by one color, then mark it and check if it is an eye
return neighbors array (without dead groups nor territories separators)
*/
BoardExactAnalysis.prototype.checkEyesInOneTerritory = function(territoryGroupName, color) {
	if(this.getMetaGroupProp(territoryGroupName, BoardExactAnalysis.PROPERTY_METAGROUP_IS_TERRITORY_MARKED) == true) {
		return [];
	}
	//territoryGroupName should be marked as color, now check if an eye
	var neighborGroupNames = new Array();//only same color (avoid dead groups and territory separators)
	var hasTerritorySeparators = false;
	for(var neighbor in this.groupNeighbors[territoryGroupName]) {
		if(this.isGroupDead(neighbor)) {
			continue;
		}
		if(BoardExactAnalysis.isTerritory(neighbor)) {
			hasTerritorySeparators = true;
			continue;
		}
		BoardExactAnalysis.addNewValueToArray(neighborGroupNames, neighbor);
	}

	var isCandidateForAnEye = false;
	var countNeighbors = this.countNeighbors(territoryGroupName);
	if(countNeighbors == 1) {
		isCandidateForAnEye = true;
	} else if (countNeighbors == 2) {
		if(this.getGroupSize(territoryGroupName)>1) {
			isCandidateForAnEye = true;
			for(var neighbor in this.groupNeighbors[territoryGroupName]) {
				if(this.isGroupInAtari(neighbor) && !this.isGroupDead(neighbor)) {
					isCandidateForAnEye = false;
					break;
				}
			}
		}
	} else if (this.getGroupSize(territoryGroupName) > countNeighbors) {
		isCandidateForAnEye = true;
	} else {
		var allMoreThanOneLiberyInT = true;
		for(var n=0; n<neighborGroupNames.length; n++) {
			var neighbor = neighborGroupNames[n];
			var countLibsInTerritory = 0;
			for(var k=0; k<this.groupLibCoords[neighbor].length;){
				var i = this.groupLibCoords[neighbor][k++];
				var j = this.groupLibCoords[neighbor][k++];
				if(this.groupNames[ScoreBoard.getKey(i, j)] == territoryGroupName){
					countLibsInTerritory++;
					if(countLibsInTerritory > 1) {//two territories: ok, next
						break;
					}
				}
			}
			if(countLibsInTerritory < 2) {
				allMoreThanOneLiberyInT = false;
				break;
			}
		}
		if(allMoreThanOneLiberyInT) {
			isCandidateForAnEye = true;
		}
	}
	var territoryCoords = this.groupCoords[territoryGroupName];
	this.markTerritory(territoryGroupName, color);
	
	if(!isCandidateForAnEye){
		return neighborGroupNames;
	}
	//territoryGroupName is an eye!
	
	//merge all groups
	var metaGroupName = this.metagroupName[neighborGroupNames[0]];
	this.addOneEye(metaGroupName, ScoreBoard.getKey(territoryCoords[0], territoryCoords[1]));
	
	//check if double eye
	var hasDoubleEyes = (this.getGroupSize(territoryGroupName) > countNeighbors + 5);
	if(!hasDoubleEyes && !hasTerritorySeparators) {
		hasDoubleEyes = this.isKnownDoubleEyeShape(territoryGroupName, neighborGroupNames.length);
	}
	if(hasDoubleEyes) {
		this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE] = true;	
	}
	
	for(var k=1; k<neighborGroupNames.length; k++) {
		this.mergeMetaGroups(metaGroupName, this.metagroupName[neighborGroupNames[k]]);
	}
	
	return neighborGroupNames;
};


/**
return true if corresponds to a live shape
*/
BoardExactAnalysis.prototype.isKnownDoubleEyeShape = function(territoryGroupName, numberOfNeighborsOfSameColor) {
	var size = this.getGroupSize(territoryGroupName);
	if(size < 4 || numberOfNeighborsOfSameColor > 2) {
		return false;
	} 
	if(size == 4 || numberOfNeighborsOfSameColor > 1) {
		return false;
	}
	
	var minDist = 4;
	if(size == 4) {
		minDist = 3;
	} else if(numberOfNeighborsOfSameColor > 1) {
		minDist += numberOfNeighborsOfSameColor;
	}
	
	//if distance between two coords of the territory is >= minDist then good shape
	var territoryCoords = this.groupCoords[territoryGroupName];
	for(var k=0; k<territoryCoords.length-2; k+=2) {
		for(var l=k+2; l<territoryCoords.length; l+=2) {
			var dist = Math.abs(territoryCoords[k]-territoryCoords[l]) + Math.abs(territoryCoords[k+1]-territoryCoords[l+1]);
			if(dist >= minDist) {
				return true;
			}
		}
	}
	return false;

};


/**
if 2 territories have exactly 2 neighbors and same neighbors (of same color), then they are 2 eyes, groups are connected and alive. idem with 3 instead of two
*/
BoardExactAnalysis.prototype.checkMultipleEyes = function() {
	var map = this.mapForCheckMultipleEyes;
	var key2Ar = new Array();
	var key3Ar = new Array();
	for(var key in map) {
		if(map[key].length == 2) {
			key2Ar.push(key);
			key3Ar.push(key);
		} else if(map[key].length == 3) {
			key3Ar.push(key);
		}
	}
	for(var i = 0; i< key2Ar.length-1; i++) {
		for(var j = i+1; j< key2Ar.length; j++) {
			var i0 = map[key2Ar[i]][0];
			var i1 = map[key2Ar[i]][1];
			var j0 = map[key2Ar[j]][0];
			var j1 = map[key2Ar[j]][1];
			if( (i0 == j0 && i1 == j1) || (i0 == j1 && i1 == j0) ) {//two eyes, connect i0 and i1, mark as alive
				var metaGroupName = this.metagroupName[i0];
				this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE] = true;	
				this.mergeMetaGroups(metaGroupName, this.metagroupName[i1]);
				
				var color = this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_COLOR];
				this.markTerritory(key2Ar[i], color);
				this.markTerritory(key2Ar[j], color);
				map[key2Ar[i]] = [];
				map[key2Ar[j]] = [];
			}
		}
	}
	for(var i = 0; i< key3Ar.length-2; i++) {
		for(var j = i+1; j< key3Ar.length-1; j++) {
			for(var k = j+1; k< key3Ar.length; k++) {
				var testMap = new Object();
				for(var n=0; n<map[key3Ar[i]].length; n++) {
					testMap[map[key3Ar[i]][n]] = true;
				}
				for(var n=0; n<map[key3Ar[j]].length; n++) {
					testMap[map[key3Ar[j]][n]] = true;
				}
				for(var n=0; n<map[key3Ar[k]].length; n++) {
					testMap[map[key3Ar[k]][n]] = true;
				}
				var territoriesGroupNames = new Array();
				for(var key in testMap) {
					territoriesGroupNames.push(key);
				}
				if(territoriesGroupNames.length != 3) {
					continue;
				}
				//three territories have in common exactly three groups, then three eyes, mark as alive
				var metaGroupName = this.metagroupName[territoriesGroupNames[0]];
				this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_IS_ALIVE] = true;	
				this.mergeMetaGroups(metaGroupName, this.metagroupName[territoriesGroupNames[1]]);
				this.mergeMetaGroups(metaGroupName, this.metagroupName[territoriesGroupNames[2]]);

				var color = this.metagroupProperties[metaGroupName][BoardExactAnalysis.PROPERTY_METAGROUP_COLOR];
				this.markTerritory(key3Ar[i], color);
				this.markTerritory(key3Ar[j], color);
				this.markTerritory(key3Ar[k], color);
				map[key3Ar[i]] = [];
				map[key3Ar[j]] = [];
				map[key3Ar[k]] = [];
			}
		}
	}

};


/**
*/
BoardExactAnalysis.prototype.checkForEyes = function() {
	for(var territoryGroupName in this.groupCoords) {
		if( !(BoardExactAnalysis.isTerritory(territoryGroupName))) {
			continue;
		}
		var color = this.checkIfTerritoryIsSurroundedOnlyByOneColor(territoryGroupName);
		if(color != null) {
			var neighbors = this.checkEyesInOneTerritory(territoryGroupName, color);
			if(neighbors.length > 1) {
				this.mapForCheckMultipleEyes[territoryGroupName] = neighbors;
			}
		}
	}
	this.checkMultipleEyes();
};

