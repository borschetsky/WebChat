import React from 'react';

const Search = (props) => {
    return(
        <div className="search">
            <input type="search" className="search-bar" placeholder="Search" onChange={(e) => props.handleSearch(e)} value={props.value}/>
         </div>
    );
};

export default Search;