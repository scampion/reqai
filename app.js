document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://localhost:8000/api'; // Adjust if your API runs elsewhere
    const navList = document.getElementById('nav-list'); // MODIFIED: More generic name for the navigation list
    const contentArea = document.getElementById('content');
    const messagesArea = document.getElementById('messages');
    const downloadRtfButton = document.getElementById('download-rtf-button');


    let currentEntityType = null; // Keep track of the currently viewed entity type
    let currentDataCache = {}; // Simple cache for entity data
    let activeTagFilter = null; // NEW: To store the currently active tag filter
    let activeVersionFilter = null; // NEW: To store the currently active version filter
    let cachedSortedUniqueTags = null; // NEW: Cache for sorted unique tags for requirements
    let cachedSortedUniqueVersions = null; // NEW: Cache for sorted unique versions for requirements
    let isIndexingInProgress = false; // NEW: Flag to track if indexing is ongoing
    const EMBEDDINGS_CACHE_KEY = 'requirementsEmbeddingsCache'; // NEW: localStorage key for embeddings
    const ASSESSMENT_OPTIONS = [ // NEW: Assessment options
        { value: "", display: "-- Not Assessed --", emoji: "❓" },
        { value: "available", display: "Available", emoji: "✅" },
        { value: "partially_available", display: "Partially Available", emoji: "🟡" },
        { value: "not_available", display: "Not Available", emoji: "🔴" }
    ];

    // --- Utility Functions ---

    function escapeHTML(str) { // NEW: Moved to global scope
        if (str === null || typeof str === 'undefined') return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function showMessage(message, isError = false) {
        messagesArea.textContent = message;
        messagesArea.className = isError ? 'error' : 'success';
        // Auto-clear message after a few seconds
        setTimeout(() => {
            messagesArea.textContent = '';
            messagesArea.className = '';
        }, 5000);
    }

    function clearContent() {
        contentArea.innerHTML = ''; // Clear previous content
    }

    function setActiveNavButton(viewIdentifier, type = 'entity') { // type can be 'entity' or 'dashboard'
         // Remove active class from all buttons in the nav list
        const buttons = navList.querySelectorAll('button');
        buttons.forEach(btn => btn.classList.remove('active'));
        
        // Add active class to the clicked button
        let activeButton;
        if (type === 'entity') {
            activeButton = navList.querySelector(`button[data-entity="${viewIdentifier}"]`);
        } else if (type === 'dashboard') {
            activeButton = navList.querySelector(`button[data-dashboard="${viewIdentifier}"]`);
        }

        if (activeButton) {
            activeButton.classList.add('active');
        }
    }

    // --- API Interaction ---

    async function fetchAPI(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                 let errorMsg = `HTTP error! Status: ${response.status}`;
                 try { // Try to get error message from response body
                     const errData = await response.json();
                     errorMsg += ` - ${errData.error || JSON.stringify(errData)}`;
                 } catch (e) { /* Ignore if response body isn't JSON */ }
                 throw new Error(errorMsg);
            }
            // Handle 204 No Content (for DELETE)
            if (response.status === 204) {
                return null; // Indicate success with no body
            }
            return await response.json(); // Parse JSON body for other successful responses
        } catch (error) {
            console.error('API Fetch Error:', error);
            showMessage(`API Error: ${error.message}`, true);
            throw error; // Re-throw for calling function to handle if needed
        }
    }

    // --- Rendering Functions ---

    function renderEntityList(entityType, items) {
        clearContent();
        currentEntityType = entityType; // Set current type
        setActiveNavButton(entityType, 'entity');

        const title = entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        let html = `<h2>${title}</h2>`;

        // --- Add Search UI for Requirements ---
        if (entityType === 'requirements') {
            html += `
                <div style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                    <input type="search" id="req-search-input" placeholder="Search requirement descriptions..." style="flex-grow: 1; padding: 8px;">
                    <button id="req-search-button" onclick="app.performSearch()" style="padding: 8px 12px;">Search</button>
                    <span id="req-search-status" style="font-size: 0.9em; color: #666;"></span>
                </div>
            `;
            // Trigger indexing if not already done (or if model wasn't ready before)
            // Defer indexing to prevent blocking the UI rendering, give a bit more time for initial render.
            setTimeout(() => ensureExtractorInitializedAndIndexRequirements(items), 100);
        }
        // --- End of NEW Search UI ---

        // --- NEW: Add Tag Cloud for Requirements ---
        if (entityType === 'requirements') {
            // Use cached sorted unique tags (now an array of objects {tag, count})
            const sortedUniqueTagsWithCounts = cachedSortedUniqueTags || [];
            let tagCloudHtml = '<div class="tag-list-container"><strong>Tag filter(s):</strong> ';

            if (sortedUniqueTagsWithCounts.length > 0) {
                sortedUniqueTagsWithCounts.forEach(tagObj => {
                    const tag = tagObj.tag;
                    const count = tagObj.count;
                    const isActive = tag === activeTagFilter;
                    const escapedTag = escapeHTML(tag); // Uses global escapeHTML
                    tagCloudHtml += `<button class="tag-button ${isActive ? 'active' : ''}" onclick="app.applyTagFilter('${escapedTag}')">${escapedTag} (${count})</button> `;
                });
                if (activeTagFilter) {
                    tagCloudHtml += `<button class="tag-button clear-filter" onclick="app.clearTagFilter()">Clear Filter (Show All)</button>`;
                }
            } else {
                tagCloudHtml += '<span>No tags defined across requirements.</span>';
            }
            tagCloudHtml += '</div>';
            html += tagCloudHtml; // Add tag cloud to the main html output

            // --- NEW: Add Version Filter for Requirements ---
            // Use cached sorted unique versions
            const sortedUniqueVersions = cachedSortedUniqueVersions || [];
            let versionFilterHtml = '<div class="version-list-container"><strong>Version filter(s):</strong> ';

            if (sortedUniqueVersions.length > 0) {
                sortedUniqueVersions.forEach(version => {
                    const isActive = version === activeVersionFilter;
                    const escapedVersion = escapeHTML(version);
                    versionFilterHtml += `<button class="version-button ${isActive ? 'active' : ''}" onclick="app.applyVersionFilter('${escapedVersion}')">${escapedVersion}</button> `;
                });
                if (activeVersionFilter) {
                    versionFilterHtml += `<button class="version-button clear-filter" onclick="app.clearVersionFilter()">Clear Filter (Show All)</button>`;
                }
            } else {
                versionFilterHtml += '<span>No versions defined across requirements.</span>';
            }
            versionFilterHtml += '</div>';
            html += versionFilterHtml; // Add version filter to the main html output
            // --- End of NEW Version Filter ---
        }
        // --- End of NEW Tag Cloud ---



        // Add "Add New" button
        html += `<button class="add-button" data-entity="${entityType}" onclick="app.renderForm('${entityType}')">Add New ${title.slice(0,-1)}</button>`; // Assumes plural title

        // --- MODIFIED: Determine actual items to display based on filters/search ---
        // --- MODIFIED: Determine actual items to display based on filters/search ---
        let displayItems = [...items]; // Start with items passed (all items or search results)
        const isSearchResult = displayItems.length > 0 && displayItems[0].hasOwnProperty('similarityScore');

        if (entityType === 'requirements' && !isSearchResult) {
            // If not showing search results, apply active filters (tag and/or version)
            // Start with the full list from cache
            let filteredItems = currentDataCache['requirements'] || [];

            if (activeTagFilter) {
                filteredItems = filteredItems.filter(
                    item => item.tags && Array.isArray(item.tags) && item.tags.some(t => String(t).trim() === activeTagFilter)
                );
            }
            if (activeVersionFilter) {
                filteredItems = filteredItems.filter(
                    item => item.version && String(item.version).trim() === activeVersionFilter
                );
            }

            // If any filter was active, displayItems becomes the filtered set.
            // Otherwise, it remains the original 'items' (which is the full list if !isSearchResult).
            if (activeTagFilter || activeVersionFilter) {
                displayItems = filteredItems;
            }
        }
        // Now 'displayItems' holds the correct set of items for rendering.

        if (!displayItems || displayItems.length === 0) {
            html += '<p>No items found.</p>';
            if (entityType === 'requirements') {
                if (activeTagFilter && activeVersionFilter) {
                    html += `<p>No requirements match tag "${escapeHTML(activeTagFilter)}" and version "${escapeHTML(activeVersionFilter)}".</p>`;
                } else if (activeTagFilter) {
                    html += `<p>No requirements match the tag: "${escapeHTML(activeTagFilter)}".</p>`;
                } else if (activeVersionFilter) {
                    html += `<p>No requirements match the version: "${escapeHTML(activeVersionFilter)}".</p>`;
                } else if (document.getElementById('req-search-input')?.value) {
                    html += '<p>Your search returned no results.</p>';
                }
            }
        } else {
            // --- NEW: Conditional rendering based on entityType ---
            if (entityType === 'requirements') {
                html += '<div id="requirements-card-view">'; // Container for card view

                // const escapeHTML = (str) => { // Moved to global scope
                // if (str === null || typeof str === 'undefined') return '';
                // return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                // };

                displayItems.forEach(item => {
                    const itemId = item.id || ''; // Ensure ID exists
                    
                    html += `<div class="requirement-card">`;
                    
                    // Card Header (ID, Name, Description, Similarity Score)
                    html += `<div class="card-header">`;
                    html += `<h3><span class="req-id">${escapeHTML(itemId)}</span>: ${escapeHTML(item.name)}</h3>`;
                    // Escape HTML first, then replace newlines with <br> for display
                    const formattedDescription = escapeHTML(item.description).replace(/\n/g, '<br>');
                    html += `<p class="requirement-description">${formattedDescription}</p>`;
                    if (isSearchResult && typeof item.similarityScore === 'number') {
                        const score = (item.similarityScore * 100).toFixed(1);
                        html += `<span class="similarity-score-badge">Similarity: ${score}%</span>`;
                    }
                    html += `</div>`; // end card-header

                    // Card Meta (Type, Priority, Version, Tags, Author)
                    html += `<div class="card-meta">`;
                    html += `<span><strong>Type:</strong> ${escapeHTML(item.type)}</span>`;

                    // --- Display Priority with Emoji ---
                    let priorityDisplay = escapeHTML(item.priority);
                    if (item.priority) {
                        const priorityEmojis = {
                            "Must Have": "⚠️",
                            "High Priority": "⭐",
                            "Medium Priority": "⚪",
                            "Low Priority": "➖",
                            "Cherry on the Cake": "✨"
                        };
                        const emoji = priorityEmojis[item.priority] || "";
                        priorityDisplay = `${emoji} ${escapeHTML(item.priority)}`;
                    }
                    html += `<span><strong>Priority:</strong> ${priorityDisplay}</span>`;
                    // --- End Display Priority with Emoji ---

                    html += `<span><strong>Version:</strong> ${escapeHTML(item.version)}</span>`;
                    html += `<span><strong>Author:</strong> ${escapeHTML(item.author)}</span>`;
                    if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
                        html += `<span><strong>Tags:</strong> ${escapeHTML(item.tags.join(', '))}</span>`;
                    } else if (item.tags) { // If tags exist but not an array or empty, display as is (might be from old data)
                        html += `<span><strong>Tags:</strong> ${escapeHTML(item.tags)}</span>`;
                    }
                    html += `</div>`; // end card-meta

                    // Card Relations (Goal, Process)
                    html += `<div class="card-relations">`;
                    let goalDisplay = 'N/A';
                    if (item.related_goal_id) {
                        if (Array.isArray(item.related_goal_id) && item.related_goal_id.length > 0) {
                            goalDisplay = escapeHTML(item.related_goal_id.join(', '));
                        } else if (typeof item.related_goal_id === 'string' && item.related_goal_id.trim() !== '') { // Handle old string data
                            goalDisplay = escapeHTML(item.related_goal_id);
                        } else if (Array.isArray(item.related_goal_id) && item.related_goal_id.length === 0) {
                            goalDisplay = 'None';
                        }
                    }
                    html += `<span><strong>Related Goal(s):</strong> ${goalDisplay}</span>`;

                    let processDisplay = 'N/A';
                    if (item.related_process_id) {
                        if (Array.isArray(item.related_process_id) && item.related_process_id.length > 0) {
                            processDisplay = escapeHTML(item.related_process_id.join(', '));
                        } else if (typeof item.related_process_id === 'string' && item.related_process_id.trim() !== '') { // Handle old string data
                            processDisplay = escapeHTML(item.related_process_id);
                        } else if (Array.isArray(item.related_process_id) && item.related_process_id.length === 0) {
                            processDisplay = 'None';
                        }
                    }
                    html += `<span><strong>Related Process(es):</strong> ${processDisplay}</span>`;
                    html += `</div>`; // end card-relations

                    // Other Details Section (collapsible or limited height might be good for cards)
                    const explicitlyHandledKeys = ['id', 'name', 'description', 'type', 'priority', 'version', 'tags', 'author', 'related_goal_id', 'related_process_id', 'similarityScore'];
                    const otherDetailsKeys = Object.keys(item).filter(key => 
                        !explicitlyHandledKeys.includes(key) && 
                        item[key] !== null && 
                        typeof item[key] !== 'undefined' && 
                        String(item[key]).trim() !== ''
                    );
                    
                    if (otherDetailsKeys.length > 0) {
                        html += `<div class="card-details">`;
                        html += `<h4>Other Details:</h4><ul>`;
                        otherDetailsKeys.forEach(key => {
                            let value = item[key];
                            const label = escapeHTML(key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
                            if (typeof value === 'object' && value !== null) {
                                const jsonString = JSON.stringify(value, null, 2);
                                const escapedJsonString = jsonString.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                value = `<pre>${escapedJsonString}</pre>`;
                            } else {
                                value = escapeHTML(value);
                            }
                            html += `<li><strong>${label}:</strong> ${value}</li>`;
                        });
                        html += `</ul></div>`; // end card-details
                    }

                    // --- NEW: Display Solution Assessments in Card ---
                    if (item.solution_assessments && Array.isArray(item.solution_assessments) && item.solution_assessments.length > 0) {
                        html += `<div class="card-solution-assessments"><h4>Solution Assessments:</h4>`;
                        item.solution_assessments.forEach(assessment => {
                            const solution = currentDataCache['solutions']?.find(s => s.id === assessment.solution_id);
                            const solutionName = solution ? escapeHTML(solution.name) : `ID: ${escapeHTML(assessment.solution_id)}`;
                            const assessmentOption = ASSESSMENT_OPTIONS.find(opt => opt.value === assessment.result);
                            const emoji = assessmentOption ? assessmentOption.emoji : '❓';
                            
                            html += `<div class="assessment-entry" style="margin-bottom: 5px; padding-left: 10px; border-left: 2px solid #eee;">`;
                            html += `<p><strong>${solutionName}:</strong> ${emoji} ${escapeHTML(assessmentOption?.display || assessment.result)}</p>`;
                            if (assessment.description) {
                                html += `<p style="font-size: 0.9em; margin-left: 15px;"><em>${escapeHTML(assessment.description).replace(/\n/g, '<br>')}</em></p>`;
                            }
                            html += `</div>`;
                        });
                        html += `</div>`; // end card-solution-assessments
                    }
                    // --- End of Display Solution Assessments ---

                    // Card Actions
                    html += '<div class="card-actions actions">';
                    if (itemId) {
                         html += `<button class="edit-button" data-entity="${entityType}" data-id="${itemId}" title="Edit" onclick="app.renderForm('${entityType}', '${itemId}')"></button>`;
                         html += `<button class="duplicate-button" data-entity="${entityType}" data-id="${itemId}" title="Duplicate" onclick="app.duplicateItem('${entityType}', '${itemId}')"></button>`; // New Duplicate Button
                         html += `<button class="delete-button" data-entity="${entityType}" data-id="${itemId}" title="Delete" onclick="app.deleteItem('${entityType}', '${itemId}')"></button>`;
                    } else {
                         html += '<span>(No ID)</span>';
                    }
                    html += '</div>'; // end card-actions
                    html += `</div>`; // end requirement-card
                });
                html += '</div>'; // end requirements-card-view
            } else {
                // --- Existing table rendering logic for other entities ---
                const headers = Object.keys(items[0]); // Safe, as items.length > 0 here
                html += '<table><thead><tr>';
                // --- Add Similarity Score header if it's search results (though search is mainly for reqs) ---
                if (isSearchResult && items[0].hasOwnProperty('similarityScore')) { // Check if first item has score
                     html += `<th>Similarity</th>`;
                }
                headers.forEach(header => {
                     if (header !== 'similarityScore') { // Don't show similarityScore as a regular column
                         html += `<th>${header.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</th>`;
                     }
                });
                html += '<th>Actions</th>';
                html += '</tr></thead><tbody>';

                displayItems.forEach(item => {
                    html += '<tr>';
                    const itemId = item.id || '';

                    if (isSearchResult && typeof item.similarityScore === 'number') {
                        const score = (item.similarityScore * 100).toFixed(1);
                        html += `<td style="text-align: right; font-weight: bold;">${score}%</td>`;
                    }

                    headers.forEach(header => {
                         if (header === 'similarityScore') return;

                        let value = item[header];
                        if (typeof value === 'object' && value !== null) {
                            const jsonString = JSON.stringify(value, null, 2)
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;');
                             value = `<pre>${jsonString}</pre>`;
                        } else {
                             value = String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        }
                        html += `<td>${value}</td>`;
                    });
                    html += '<td class="actions">';
                    if (itemId) {
                         html += `<button class="edit-button" data-entity="${entityType}" data-id="${itemId}" title="Edit" onclick="app.renderForm('${entityType}', '${itemId}')"></button>`;
                         html += `<button class="delete-button" data-entity="${entityType}" data-id="${itemId}" title="Delete" onclick="app.deleteItem('${entityType}', '${itemId}')"></button>`;
                    } else {
                         html += '<span>(No ID)</span>';
                    }
                    html += '</td></tr>';
                });
                html += '</tbody></table>';
            }
        }
        contentArea.innerHTML = html;
    }

    // --- MODIFIED: To handle both related Goals and Processes ---
    async function renderForm(entityType, itemId = null) {
        clearContent();
        currentEntityType = entityType; // Ensure type is set
        setActiveNavButton(entityType, 'entity'); // Keep nav active
        showMessage('Loading form...'); // Show loading message

        const isEdit = itemId !== null;
        const title = isEdit ? `Edit ${entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).slice(0,-1)}`
                             : `Add New ${entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).slice(0,-1)}`;

        let formHtml = `<div class="form-container"><h3>${title}</h3>`;
        formHtml += `<form id="entity-form">`;

        // --- MODIFIED: Fetch related data needed for dropdowns (Goals & Processes) ---
        let relatedData = {};
        if (entityType === 'requirements') {
            try {
                // Use Promise.all to fetch goals and processes concurrently
                const results = await Promise.all([
                    // Fetch goals (check cache first)
                    currentDataCache['goals_and_objectives'] ? Promise.resolve(currentDataCache['goals_and_objectives']) : fetchAPI('/entities/goals_and_objectives'),
                    // Fetch processes (check cache first)
                    currentDataCache['business_processes'] ? Promise.resolve(currentDataCache['business_processes']) : fetchAPI('/entities/business_processes'),
                    // Fetch solutions (check cache first) // NEW
                    currentDataCache['solutions'] ? Promise.resolve(currentDataCache['solutions']) : fetchAPI('/entities/solutions')
                ]);

                const goals = results[0] || [];
                const processes = results[1] || [];
                const solutions = results[2] || []; // NEW

                // Cache fetched data
                currentDataCache['goals_and_objectives'] = goals;
                currentDataCache['business_processes'] = processes;
                currentDataCache['solutions'] = solutions; // NEW

                // Prepare IDs for dropdowns
                relatedData.goalIds = goals.map(goal => goal.id).filter(id => id);
                relatedData.processIds = processes.map(proc => proc.id).filter(id => id);
                // Solutions data will be used directly for iterating in the form
                relatedData.solutions = solutions; // NEW

                console.log("Goal IDs for dropdown:", relatedData.goalIds);
                console.log("Process IDs for dropdown:", relatedData.processIds);
                console.log("Solutions for assessment:", relatedData.solutions); // NEW

            } catch (error) {
                console.error("Failed to fetch related data for dropdowns:", error);
                showMessage("Warning: Could not load related Goals or Processes for dropdowns.", true);
                // Proceed without dropdown data, will fallback to text inputs
            }
        }
        // Add more else if blocks here for other entity types needing related data

        // --- Build Form Fields function (accepts relatedData) ---
        const buildFormFields = (itemData, related) => {
             let fieldsHtml = '';
             if (isEdit) {
                  // Hidden field for ID during edit
                  fieldsHtml += `<input type="hidden" name="id" value="${itemId}">`;
                  fieldsHtml += `<p><strong>ID:</strong> ${itemId}</p>`; // Display ID
             }

             // Determine field keys: Use itemData keys, exclude 'id' for display
             let fieldKeys = Object.keys(itemData).filter(key => !(isEdit && key === 'id'));

             // For requirements, ensure 'name' and 'author' are at the beginning
             if (entityType === 'requirements') {
                 const preferredOrder = ['name', 'author'];
                 const orderedKeys = preferredOrder.filter(k => fieldKeys.includes(k));
                 const remainingKeys = fieldKeys.filter(k => !preferredOrder.includes(k));
                 fieldKeys = [...orderedKeys, ...remainingKeys];
             }

             fieldKeys.forEach(key => {
                 const currentValue = itemData[key]; // Value from the item being edited or default
                 const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                 const fieldId = `field_${key}`;

                 // NEW: Skip keys that are handled by the dedicated solution assessment section
                 // to prevent duplicate form elements.
                 if (key.startsWith('assessment_result_') || key.startsWith('assessment_description_')) {
                     return; // Skip this key
                 }

                 fieldsHtml += `<div><label for="${fieldId}">${label}:</label>`;

                // --- Dropdown for Related Goal ID (Multiple Select) ---
                if (key === 'related_goal_id' && entityType === 'requirements' && related?.goalIds?.length > 0) {
                    fieldsHtml += `<select id="${fieldId}" name="${key}" multiple size="5">`; // Added multiple and size
                    const goals = currentDataCache['goals_and_objectives'] || [];
                    // Ensure currentValue is an array for checking inclusion
                    const currentSelectedGoalIds = Array.isArray(currentValue) ? currentValue : (currentValue ? [String(currentValue)] : []);
                    goals.forEach(goal => {
                        if (!goal.id) return;
                        const selectedAttr = currentSelectedGoalIds.includes(String(goal.id)) ? ' selected' : '';
                        const description = goal.description ? goal.description.substring(0, 50) + (goal.description.length > 50 ? '...' : '') : '';
                        fieldsHtml += `<option value="${goal.id}"${selectedAttr}>${goal.id} - ${description}</option>`;
                    });
                    fieldsHtml += `</select>`;
                    fieldsHtml += `<small>Maintenez Ctrl/Cmd enfoncé pour sélectionner plusieurs objectifs.</small>`;
                }
                // --- Dropdown for Related Process ID (Multiple Select) ---
                else if (key === 'related_process_id' && entityType === 'requirements' && related?.processIds?.length > 0) {
                    fieldsHtml += `<select id="${fieldId}" name="${key}" multiple size="5">`; // Added multiple and size
                    const processes = currentDataCache['business_processes'] || [];
                    // Ensure currentValue is an array for checking inclusion
                    const currentSelectedProcessIds = Array.isArray(currentValue) ? currentValue : (currentValue ? [String(currentValue)] : []);
                    processes.forEach(process => {
                        if (!process.id) return;
                        const selectedAttr = currentSelectedProcessIds.includes(String(process.id)) ? ' selected' : '';
                        const description = process.description ? process.description.substring(0, 50) + (process.description.length > 50 ? '...' : '') : '';
                        fieldsHtml += `<option value="${process.id}"${selectedAttr}>${process.id} - ${description}</option>`;
                    });
                    fieldsHtml += `</select>`;
                    fieldsHtml += `<small>Maintenez Ctrl/Cmd enfoncé pour sélectionner plusieurs processus.</small>`;
                }
                // --- NEW: Dropdown for 'priority' for requirements ---
                else if (key === 'priority' && entityType === 'requirements') {
                    const priorityOptions = [
                        { value: "", display: "-- Select Priority --" },
                        { value: "Must Have", display: "⚠️ Must Have" },
                        { value: "High Priority", display: "⭐ High Priority" },
                        { value: "Medium Priority", display: "⚪ Medium Priority" },
                        { value: "Low Priority", display: "➖ Low Priority" },
                        { value: "Cherry on the Cake", display: "✨ Cherry on the Cake" }
                    ];
                    fieldsHtml += `<select id="${fieldId}" name="${key}">`;
                    priorityOptions.forEach(opt => {
                        const selectedAttr = (opt.value === currentValue) ? ' selected' : '';
                        fieldsHtml += `<option value="${escapeHTML(opt.value)}"${selectedAttr}>${escapeHTML(opt.display)}</option>`;
                    });
                    fieldsHtml += `</select>`;
                }
                // --- End of Dropdown Logic ---
                // --- NEW: Specific input for 'tags' on requirements ---
                else if (key === 'tags' && entityType === 'requirements') {
                    const tagsString = Array.isArray(currentValue) ? currentValue.join(',') : '';
                    // Escape double quotes for the value attribute if a tag itself contains a quote.
                    const escapedTagsString = tagsString.replace(/"/g, '&quot;');
                    fieldsHtml += `<input type="text" id="${fieldId}" name="${key}" value="${escapedTagsString}">`;
                    fieldsHtml += `<small>Comma-separated tags</small>`;
                }
                // --- NEW: Textarea for 'description' field ---
                else if (key === 'description') {
                    const escapedValue = String(currentValue ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); // Basic escaping for textarea
                    fieldsHtml += `<textarea id="${fieldId}" name="${key}" rows="10">${escapedValue}</textarea>`;
                }
                // Fallback to existing logic for other fields
                else if (typeof currentValue === 'object' && currentValue !== null) {
                      const jsonString = JSON.stringify(currentValue, null, 2);
                      fieldsHtml += `<textarea id="${fieldId}" name="${key}" rows="5">${jsonString}</textarea>`;
                      fieldsHtml += `<small>Edit as JSON</small>`;
                 } else if (typeof currentValue === 'boolean') {
                      fieldsHtml += `<select id="${fieldId}" name="${key}">`;
                      fieldsHtml += `<option value="true" ${currentValue ? 'selected' : ''}>True</option>`;
                      fieldsHtml += `<option value="false" ${!currentValue ? 'selected' : ''}>False</option>`;
                      fieldsHtml += `</select>`;
                 }
                 else {
                      const escapedValue = String(currentValue ?? '').replace(/"/g, '&quot;'); // Use nullish coalescing for default empty string
                      fieldsHtml += `<input type="text" id="${fieldId}" name="${key}" value="${escapedValue}">`;
                 }
                 fieldsHtml += `</div>`;
             });

            // --- NEW: Solution Assessments Section for Requirements ---
            if (entityType === 'requirements' && related?.solutions?.length > 0) {
                fieldsHtml += `<hr><h4>Solution Assessments</h4>`;
                const currentAssessments = itemData.solution_assessments || []; // itemData is itemDataForForm

                related.solutions.forEach(solution => {
                    if (!solution.id || !solution.name) return; // Skip solutions without id/name

                    const existingAssessment = currentAssessments.find(asm => asm.solution_id === solution.id);
                    const currentResult = existingAssessment ? existingAssessment.result : "";
                    const currentDescription = existingAssessment ? (existingAssessment.description || "") : "";


                    fieldsHtml += `<div class="solution-assessment-group" style="border: 1px solid #eee; padding: 10px; margin-bottom: 10px;">`;
                    fieldsHtml += `<h5>${escapeHTML(solution.name)} (ID: ${escapeHTML(solution.id)})</h5>`;
                    
                    // Assessment Result Dropdown
                    fieldsHtml += `<div><label for="assessment_result_${solution.id}">Assessment:</label>`;
                    fieldsHtml += `<select id="assessment_result_${solution.id}" name="assessment_result_${solution.id}">`;
                    ASSESSMENT_OPTIONS.forEach(opt => {
                        const selectedAttr = (opt.value === currentResult) ? ' selected' : '';
                        fieldsHtml += `<option value="${escapeHTML(opt.value)}"${selectedAttr}>${opt.emoji} ${escapeHTML(opt.display)}</option>`;
                    });
                    fieldsHtml += `</select></div>`;

                    // Assessment Description Textarea
                    fieldsHtml += `<div><label for="assessment_description_${solution.id}">Description:</label>`;
                    fieldsHtml += `<textarea id="assessment_description_${solution.id}" name="assessment_description_${solution.id}" rows="3">${escapeHTML(currentDescription)}</textarea></div>`;
                    
                    fieldsHtml += `</div>`; // end solution-assessment-group
                });
            }
            // --- End of Solution Assessments Section ---

             formHtml += fieldsHtml; // This now includes the main fields and assessment fields
             formHtml += `<button type="submit">${isEdit ? 'Update Item' : 'Add Item'}</button>`;
             formHtml += `<button type="button" class="cancel-button" onclick="app.loadEntityList('${entityType}')">Cancel</button>`;
             formHtml += `</form></div>`;
             contentArea.innerHTML = formHtml;
             showMessage(''); // Clear loading message

             // Add submit event listener AFTER the form is in the DOM
             const formElement = document.getElementById('entity-form');
             if (formElement) {
                formElement.addEventListener('submit', (event) => handleFormSubmit(event, entityType, isEdit));
             } else {
                 console.error("Could not find form element #entity-form to attach listener.");
             }
        };

        // --- Fetch item data (for edit) or sample structure (for add) ---
        try {
            let itemDataForForm;
            if (isEdit) {
                // Fetch the specific item data for editing
                itemDataForForm = await fetchAPI(`/entities/${entityType}/${itemId}`);
                if (!itemDataForForm) {
                     throw new Error(`Item ${itemId} not found.`);
                }
            } else {
                // For 'Add', create a structure with empty/default values based on a sample item
                const sampleItems = currentDataCache[entityType] || await fetchAPI(`/entities/${entityType}?limit=1`); // Fetch one if not cached
                const sampleItem = sampleItems?.[0] || {}; // Use first item or empty object

                itemDataForForm = {};
                let keysToUse = Object.keys(sampleItem);
                // Ensure essential requirement fields exist even if sample is empty
                 if(entityType === 'requirements') {
                     const requiredKeys = ['name', 'description', 'type', 'priority', 'related_goal_id', 'related_process_id', 'version', 'tags', 'author'];
                     requiredKeys.forEach(reqKey => {
                         if (!keysToUse.includes(reqKey)) {
                             keysToUse.push(reqKey);
                         }
                     });
                 } else if (entityType === 'solutions') { // NEW: Default fields for new Solutions
                    const solutionKeys = ['name', 'description']; // Add other core fields for solutions if any
                    solutionKeys.forEach(solKey => {
                        if (!keysToUse.includes(solKey)) {
                            keysToUse.push(solKey);
                        }
                    });
                }
                // Add more defaults for other types if needed

                keysToUse.forEach(key => {
                    if (key !== 'id') { // Don't include 'id' field for adding
                        const sampleValue = sampleItem[key];
                        if (typeof sampleValue === 'object' && sampleValue !== null) {
                            itemDataForForm[key] = Array.isArray(sampleValue) ? [] : {}; // Empty array/object
                        } else if (typeof sampleValue === 'boolean') {
                            itemDataForForm[key] = false; // Default bool
                        } else {
                            // Ensure related ID fields start empty for selection
                            if (key === 'related_goal_id') {
                                itemDataForForm[key] = []; // related_goal_id is now an array for multi-select
                            } else if (key === 'related_process_id') {
                                itemDataForForm[key] = []; // related_process_id is now an array for multi-select
                            } else if (key === 'priority' && entityType === 'requirements') {
                                itemDataForForm[key] = ''; // Default to empty for "Select Priority"
                            } else if (key === 'tags' && entityType === 'requirements') { // Initialize tags as an empty array for new requirements
                                 itemDataForForm[key] = [];
                            }
                            // NEW: Initialize solution_assessments for new requirements
                            else if (key === 'solution_assessments' && entityType === 'requirements') {
                                itemDataForForm[key] = [];
                            }
                            else {
                                 itemDataForForm[key] = sampleValue ?? ''; // Default empty string from sample or truly empty
                            }
                        }
                    }
                });
                // NEW: Ensure solution_assessments field exists for new requirements if not in sample
                if (entityType === 'requirements' && typeof itemDataForForm.solution_assessments === 'undefined') {
                    itemDataForForm.solution_assessments = [];
                }
            }

            // Ensure 'name', 'author', 'tags', 'related_goal_id', 'related_process_id' fields are present and correctly typed for editing requirements
            if (isEdit && entityType === 'requirements') {
                if (typeof itemDataForForm.name === 'undefined') {
                    itemDataForForm.name = ''; 
                }
                if (typeof itemDataForForm.author === 'undefined') {
                    itemDataForForm.author = ''; 
                }
                if (typeof itemDataForForm.tags === 'undefined' || !Array.isArray(itemDataForForm.tags)) {
                    itemDataForForm.tags = []; 
                }
                // Ensure related_goal_id is an array
                if (typeof itemDataForForm.related_goal_id === 'undefined') {
                    itemDataForForm.related_goal_id = [];
                } else if (!Array.isArray(itemDataForForm.related_goal_id)) {
                    itemDataForForm.related_goal_id = itemDataForForm.related_goal_id ? [String(itemDataForForm.related_goal_id)] : [];
                }
                // Ensure related_process_id is an array
                if (typeof itemDataForForm.related_process_id === 'undefined') {
                    itemDataForForm.related_process_id = [];
                } else if (!Array.isArray(itemDataForForm.related_process_id)) {
                    itemDataForForm.related_process_id = itemDataForForm.related_process_id ? [String(itemDataForForm.related_process_id)] : [];
                }
                // NEW: Ensure solution_assessments is an array for editing requirements
                if (typeof itemDataForForm.solution_assessments === 'undefined' || !Array.isArray(itemDataForForm.solution_assessments)) {
                    itemDataForForm.solution_assessments = [];
                }
            }

            // --- Pass relatedData to buildFormFields ---
            buildFormFields(itemDataForForm, relatedData);

        } catch (error) {
            console.error("Error preparing form:", error);
            showMessage(`Error loading form data: ${error.message}`, true);
            contentArea.innerHTML = `<p style="color:red;">Could not load form.</p>`; // Show error in content area
        }
    }


    // --- Event Handlers ---

    async function handleFormSubmit(event, entityType, isEdit) {
        event.preventDefault(); // Prevent default browser submission
        const form = event.target;
        const formData = new FormData(form);
        const dataPayload = {};

        // Iterate over all unique keys present in the form to handle multi-select correctly
        const formKeys = Array.from(new Set(Array.from(formData.keys())));

        formKeys.forEach(key => {
            const element = form.elements[key]; // Get the form element

            if (entityType === 'requirements' && element && element.tagName === 'SELECT' && element.multiple) {
                // Generic handling for all multiple select fields for requirements
                if (key === 'related_goal_id' || key === 'related_process_id') {
                    dataPayload[key] = formData.getAll(key); // Gets an array of selected values. Empty array if none selected.
                }
                // Add other multi-select keys here if any in the future
            } else if (key === 'tags' && entityType === 'requirements') {
                const value = formData.get(key); // Tags are a single input field, comma-separated string
                const trimmedValue = typeof value === 'string' ? value.trim() : '';
                if (trimmedValue.length > 0) {
                    dataPayload[key] = trimmedValue.split(',')
                                          .map(tag => tag.trim())
                                          .filter(tag => tag.length > 0);
                } else {
                    dataPayload[key] = []; // Send empty array if input is empty
                }
            } else {
                // General handling for other fields
                const value = formData.get(key); // For single-value fields
                const trimmedValue = typeof value === 'string' ? value.trim() : value;

                if ((element?.tagName === 'TEXTAREA') || (typeof trimmedValue === 'string' && (trimmedValue.startsWith('{') || trimmedValue.startsWith('[')))) {
                    try {
                        dataPayload[key] = JSON.parse(trimmedValue);
                    } catch (e) {
                        dataPayload[key] = trimmedValue; // Send as string if invalid JSON
                    }
                } else if (element?.tagName === 'SELECT' && (value === 'true' || value === 'false')) {
                     dataPayload[key] = (value === 'true'); // Convert boolean strings
                }
                // Ensure empty selection in single dropdowns becomes null
                else if (element?.tagName === 'SELECT' && value === '' && !(element.multiple)) {
                     dataPayload[key] = null;
                }
                else {
                    dataPayload[key] = value; // Assign raw value (could be string, or first value of a multi-select if not handled above)
                }
            }
        });

        // --- NEW: Collect Solution Assessments for Requirements ---
        if (entityType === 'requirements' && currentDataCache['solutions']) {
            dataPayload.solution_assessments = [];
            currentDataCache['solutions'].forEach(solution => {
                if (solution.id) {
                    const result = formData.get(`assessment_result_${solution.id}`);
                    const description = formData.get(`assessment_description_${solution.id}`);

                    // Only add assessment if a result is selected (not the default "-- Not Assessed --" which has value "")
                    if (result && result !== "") {
                        dataPayload.solution_assessments.push({
                            solution_id: solution.id,
                            result: result,
                            description: description || "" // Ensure description is at least an empty string
                        });
                    }
                }
            });
        }
        // --- End of Collect Solution Assessments ---
        
        const itemId = isEdit ? formData.get('id') : null; // Get ID if editing
        const method = isEdit ? 'PUT' : 'POST';
        const endpoint = isEdit ? `/entities/${entityType}/${itemId}` : `/entities/${entityType}`;

        try {
            showMessage('Saving...'); // Provide feedback
            const result = await fetchAPI(endpoint, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataPayload)
            });
            showMessage(`Item ${isEdit ? 'updated' : 'added'} successfully!`, false);
            // Clear relevant caches and reload list
            delete currentDataCache[entityType];
            if (entityType === 'requirements') {
                 localStorage.removeItem(EMBEDDINGS_CACHE_KEY); // NEW: Invalidate embeddings cache
                 delete currentDataCache['goals_and_objectives'];
                 delete currentDataCache['business_processes'];
            }
            loadEntityList(entityType);
        } catch (error) {
            // Error already shown by fetchAPI, maybe add more context
             showMessage(`Failed to ${isEdit ? 'update' : 'add'} item. ${error.message}`, true);
        }
    }

    async function deleteItem(entityType, itemId) {
        // Get current time in Brussels
        const now = new Date();
        const options = { timeZone: 'Europe/Brussels', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' };
        const timeString = now.toLocaleTimeString('en-GB', options);
        const dateString = now.toLocaleDateString('en-CA'); // YYYY-MM-DD

        if (confirm(`(${dateString} ${timeString} Brussels Time)\nAre you sure you want to delete item ${itemId} from ${entityType}?`)) {
            try {
                 showMessage('Deleting...');
                 await fetchAPI(`/entities/${entityType}/${itemId}`, { method: 'DELETE' });
                 showMessage(`Item ${itemId} deleted successfully.`, false);
                 // Clear cache for this type and reload list
                 delete currentDataCache[entityType];
                 if (entityType === 'requirements') { // NEW: Invalidate embeddings cache
                    localStorage.removeItem(EMBEDDINGS_CACHE_KEY);
                 }
                 loadEntityList(entityType);
            } catch (error) {
                 // Error message already shown by fetchAPI
                  showMessage(`Failed to delete item ${itemId}. ${error.message}`, true);
            }
        }
    }

    async function loadEntityList(entityType) {
        showMessage('Loading data...');
        try {
            // Check cache first
            if (!currentDataCache[entityType]) {
                const data = await fetchAPI(`/entities/${entityType}`);
                if (!data) {
                    throw new Error(`No data returned for ${entityType}`);
                }
                currentDataCache[entityType] = data;
            }
            
            const items = currentDataCache[entityType];
            if (!items) {
                throw new Error(`No items found for ${entityType}`);
            }

            // NEW: If requirements data is loaded/reloaded, update cached tags and versions
            // This block is now outside the 'if (!currentDataCache[entityType])'
            // and will run every time loadEntityList is called for requirements,
            // using 'items' (which is currentDataCache[entityType]) as the source.
            if (entityType === 'requirements' && items) { 
                const allRequirementsForFilters = items; // Use 'items'
                const tagCounts = new Map(); 

                if (allRequirementsForFilters && allRequirementsForFilters.length > 0) {
                    allRequirementsForFilters.forEach(item => {
                        if (item.tags && Array.isArray(item.tags)) {
                            item.tags.forEach(tag => {
                                const trimmedTag = String(tag).trim();
                                if (trimmedTag) {
                                    tagCounts.set(trimmedTag, (tagCounts.get(trimmedTag) || 0) + 1);
                                }
                            });
                        }
                    });
                }
                cachedSortedUniqueTags = Array.from(tagCounts.entries())
                    .map(([tag, count]) => ({ tag, count }))
                    .sort((a, b) => a.tag.localeCompare(b.tag));

                const uniqueVersionsSet = new Set();
                if (allRequirementsForFilters && allRequirementsForFilters.length > 0) {
                    allRequirementsForFilters.forEach(item => {
                        if (item.version && String(item.version).trim()) {
                            uniqueVersionsSet.add(String(item.version).trim());
                        }
                    });
                }
                cachedSortedUniqueVersions = Array.from(uniqueVersionsSet).sort();
            }
            
            // Render the list
            renderEntityList(entityType, items);
            showMessage(''); // Clear loading message

        } catch (error) {
            console.error(`Error loading ${entityType}:`, error);
            showMessage(`Failed to load ${entityType}: ${error.message}`, true);
            contentArea.innerHTML = `
                <div style="color: red; margin: 20px;">
                    <p>Failed to load ${entityType.replace(/_/g, ' ')} data.</p>
                    <p>Error: ${error.message}</p>
                    <button onclick="app.loadEntityList('${entityType}')">Retry</button>
                </div>
            `;
        }
    }


    // --- Initialization ---

    async function initialize() {
        try {
            // Clear 'Loading...' from the main nav list
            navList.innerHTML = '';

            // --- NEW: Add Dashboards Section ---
            const dashboardsTitle = document.createElement('li');
            dashboardsTitle.className = 'nav-section-title';
            dashboardsTitle.innerHTML = '<span>Dashboards</span>';
            navList.appendChild(dashboardsTitle);

            const samLi = document.createElement('li');
            const samButton = document.createElement('button');
            samButton.textContent = '📊 Solution Assessment Matrix';
            samButton.dataset.dashboard = 'solution_assessment_matrix';
            samButton.onclick = () => app.loadSolutionAssessmentMatrix();
            samLi.appendChild(samButton);
            navList.appendChild(samLi);

            // NEW: Add Full Report button to Dashboards
            const reportLi = document.createElement('li');
            const reportButton = document.createElement('button');
            reportButton.textContent = '📄 Full Report';
            reportButton.dataset.dashboard = 'full_report';
            reportButton.onclick = () => app.loadFullReport();
            reportLi.appendChild(reportButton);
            navList.appendChild(reportLi);
            // --- End of NEW Dashboards Section ---

            // --- Add Entities Section ---
            const entitiesTitle = document.createElement('li');
            entitiesTitle.className = 'nav-section-title';
            entitiesTitle.innerHTML = '<span>Entities</span>';
            navList.appendChild(entitiesTitle);

            const entityTypes = await fetchAPI('/entity_types');
            const emojiMap = {
                'stakeholders': '👥',
                'goals_and_objectives': '🎯',
                'business_processes': '🔄',
                'requirements': '📋',
                'systems_and_applications': '💻',
                'data_entities': '🗄️',
                'risks_and_constraints': '⚠️',
                'metrics_and_kpis': '📊',
                'solutions': '💡' // NEW: Added Solutions
            };
            entityTypes.sort().forEach(type => {
                const li = document.createElement('li');
                const button = document.createElement('button');
                const emoji = emojiMap[type] || '📌';
                button.textContent = `${emoji} ${type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
                button.dataset.entity = type; // Store entity type in data attribute
                button.onclick = () => loadEntityList(type);
                li.appendChild(button);
                navList.appendChild(li); // Append to the main nav list
            });

            // --- MODIFIED: Load Solution Assessment Matrix by default ---
            if (typeof app.loadSolutionAssessmentMatrix === 'function') {
                 app.loadSolutionAssessmentMatrix();
            } else if (entityTypes.includes('requirements')) { // Fallback if matrix function not ready (should not happen)
                loadEntityList('requirements');
            } else if (entityTypes.length > 0) {
                loadEntityList(entityTypes[0]);
            } else {
                contentArea.innerHTML = '<p>No entity types or dashboards found. Cannot load default view.</p>';
            }
            // --- End of MODIFIED Default Load ---

        } catch (error) {
            navList.innerHTML = '<li>Error loading navigation. Is the API running?</li>'; // Update error message target
            console.error("Initialization failed:", error);
            showMessage("Could not load navigation items from API.", true);
        }

        // --- NEW: Add listener for Download button ---
        if (downloadRtfButton) {
            downloadRtfButton.addEventListener('click', () => {
                showMessage('Preparing download...');
                // Simply navigate to the export endpoint. The browser will handle the download.
                window.location.href = `${API_BASE_URL}/export/rtf`;
                // Clear message after a short delay, as we don't get explicit success feedback here easily
                 setTimeout(() => showMessage(''), 2000);
            });
        } else {
            console.error("Download button not found.");
        }
    }

    // --- Text Embedding and Search Functionality ---
    let featureExtractor = null;
    let requirementsIndex = null;
    let transformersInitialized = false;

    async function ensureExtractorInitializedAndIndexRequirements(requirements) {
        // 1. Initialize feature extractor (one-time)
        if (!transformersInitialized) {
            try {
                showMessage('Loading text embedding model...');
                const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0');
                featureExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
                transformersInitialized = true;
                showMessage('Text embedding model ready.');
            } catch (error) {
                console.error('Failed to initialize feature extractor:', error);
                showMessage('Failed to initialize search capabilities. Search will be unavailable.', true);
                return false; // Critical failure
            }
        }

        // If no requirements or featureExtractor failed, nothing to index
        if (!requirements || requirements.length === 0 || !featureExtractor) {
            return false;
        }

        // NEW: Try to load embeddings from localStorage
        if (transformersInitialized) { // Only attempt if model itself is ready
            try {
                const cachedEmbeddingsJSON = localStorage.getItem(EMBEDDINGS_CACHE_KEY);
                if (cachedEmbeddingsJSON) {
                    const loadedIndex = JSON.parse(cachedEmbeddingsJSON);
                    const indexableRequirementsCount = requirements.filter(r => r.id && r.description && String(r.description).trim() !== '').length;

                    if (Object.keys(loadedIndex).length > 0 && indexableRequirementsCount > 0 && Object.keys(loadedIndex).length === indexableRequirementsCount) {
                        requirementsIndex = loadedIndex;
                        showMessage('Loaded requirement embeddings from cache.');
                        // isIndexingInProgress remains false as we are not actively batch indexing
                        return true; // Successfully loaded from cache
                    } else if (Object.keys(loadedIndex).length > 0) {
                        // Mismatch in count, cache might be stale
                        showMessage('Cached embeddings seem outdated, re-indexing...');
                        localStorage.removeItem(EMBEDDINGS_CACHE_KEY); // Clear stale cache
                    }
                }
            } catch (e) {
                console.warn('Could not load or parse embeddings from localStorage:', e);
                localStorage.removeItem(EMBEDDINGS_CACHE_KEY); // Clear cache if parsing failed
            }
        }

        if (isIndexingInProgress) {
            showMessage('Indexing is already in progress. Please wait.');
            return false; 
        }

        isIndexingInProgress = true;
        requirementsIndex = {}; // Always start with a fresh index if not loaded from cache

        showMessage('Indexing requirements for search (this may take a moment)...');
        try {
            const BATCH_SIZE = 10; // Process requirements in chunks
            let processedCount = 0;
            const totalRequirements = requirements.length;

            for (let i = 0; i < totalRequirements; i += BATCH_SIZE) {
                const currentBatch = requirements.slice(i, i + BATCH_SIZE);
                
                const itemsToIndexInBatch = currentBatch.filter(req => req.id && req.description && String(req.description).trim() !== '');
                const textsToEmbed = itemsToIndexInBatch.map(req => req.description);

                if (textsToEmbed.length > 0) {
                    const embeddingsBatch = await featureExtractor(textsToEmbed, { pooling: 'mean', normalize: true });

                    itemsToIndexInBatch.forEach((req, indexInFilteredBatch) => {
                        requirementsIndex[req.id] = {
                            embedding: embeddingsBatch[indexInFilteredBatch].data,
                            requirement: req
                        };
                    });
                }

                processedCount += currentBatch.length;
                // Update message only if not the very last batch that would be covered by final message
                if (processedCount < totalRequirements) {
                     showMessage(`Indexing: ${processedCount}/${totalRequirements} requirements processed...`);
                }
                
                // Yield to the event loop to keep UI responsive
                await new Promise(resolve => setTimeout(resolve, 0)); 
            }
            const indexedItemsCount = Object.keys(requirementsIndex).length;
            let finalMessage = '';

            if (indexedItemsCount > 0) {
                finalMessage = `Requirements indexed. ${indexedItemsCount} items ready.`;
            } else if (totalRequirements > 0) {
                finalMessage = `Indexing complete. No requirements had descriptions to index.`;
            } else {
                finalMessage = `Indexing complete. No requirements to index.`;
            }

            // NEW: Try to save to localStorage
            if (indexedItemsCount > 0) { // Only try to save if there's something to save
                try {
                    localStorage.setItem(EMBEDDINGS_CACHE_KEY, JSON.stringify(requirementsIndex));
                    finalMessage = `Requirements indexed and embeddings cached. ${indexedItemsCount} items ready.`;
                } catch (e) {
                    console.warn('Could not save embeddings to localStorage:', e);
                    finalMessage += ' (Could not cache embeddings)';
                }
            }
            showMessage(finalMessage);
            return true;
        } catch (error) {
            console.error('Failed to index requirements:', error);
            showMessage('Error during requirements indexing. Search may be incomplete.', true);
            return false;
        } finally {
            isIndexingInProgress = false;
        }
    }

    async function performSearch() {
        const searchInput = document.getElementById('req-search-input');
        const searchTerm = searchInput?.value.trim();
        const searchStatus = document.getElementById('req-search-status');
        
        if (!searchTerm) {
            searchStatus.textContent = 'Please enter a search term';
            return;
        }

        try {
            searchStatus.textContent = 'Searching...';
            // First ensure we have embeddings for all requirements
            const allRequirements = currentDataCache['requirements'] || await fetchAPI('/entities/requirements');
            const initialized = await ensureExtractorInitializedAndIndexRequirements(allRequirements);
            
            if (!initialized || !featureExtractor) {
                throw new Error('Search functionality not available');
            }

            // Generate embedding for search query
            const queryEmbedding = await featureExtractor(searchTerm, { pooling: 'mean', normalize: true });
            
            // Calculate cosine similarity between query and all requirements
            const results = [];
            for (const reqId in requirementsIndex) {
                const { embedding, requirement } = requirementsIndex[reqId];
                const similarity = cosineSimilarity(queryEmbedding.data, embedding);
                
                if (similarity > 0.3) { // Only include results with reasonable similarity
                    results.push({
                        ...requirement,
                        similarityScore: similarity
                    });
                }
            }

            // Sort by similarity score (highest first)
            results.sort((a, b) => b.similarityScore - a.similarityScore);
            
            if (results && results.length > 0) {
                renderEntityList('requirements', results);
                searchStatus.textContent = `Found ${results.length} matching requirements`;
            } else {
                renderEntityList('requirements', []);
                searchStatus.textContent = 'No matching requirements found';
            }
        } catch (error) {
            console.error('Search failed:', error);
            searchStatus.textContent = 'Search failed - see console';
            showMessage(`Search error: ${error.message}`, true);
        }
    }

    // Utility function to calculate cosine similarity between vectors
    function cosineSimilarity(a, b) {
        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            magnitudeA += a[i] * a[i];
            magnitudeB += b[i] * b[i];
        }
        
        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);
        
        return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
    }

    // --- NEW: Tag Filtering Functions ---
    function applyTagFilter(tag) {
        activeTagFilter = tag;
        // Clear search input when applying a tag filter
        const searchInput = document.getElementById('req-search-input');
        if (searchInput) searchInput.value = '';
        const searchStatus = document.getElementById('req-search-status');
        if (searchStatus) searchStatus.textContent = '';
        
        loadEntityList('requirements'); // Reload/re-render the list which will apply the filter
    }

    function clearTagFilter() {
        activeTagFilter = null;
        loadEntityList('requirements'); // Reload/re-render the list
    }

    // --- NEW: Version Filtering Functions ---
    function applyVersionFilter(version) {
        activeVersionFilter = version;
        // Clear search input when applying a version filter
        const searchInput = document.getElementById('req-search-input');
        if (searchInput) searchInput.value = '';
        const searchStatus = document.getElementById('req-search-status');
        if (searchStatus) searchStatus.textContent = '';
        
        loadEntityList('requirements'); // Reload/re-render the list which will apply the filter
    }

    function clearVersionFilter() {
        activeVersionFilter = null;
        loadEntityList('requirements'); // Reload/re-render the list
    }
    // --- End of Version Filtering Functions ---

    // --- NEW: Duplicate Item Function ---
    async function duplicateItem(entityType, itemId) {
        if (entityType !== 'requirements') {
            showMessage('Duplication is only supported for requirements.', true);
            return;
        }

        if (!confirm(`Are you sure you want to duplicate requirement ${itemId}? A new requirement will be created based on this one.`)) {
            return;
        }

        try {
            showMessage('Duplicating item...');
            // 1. Fetch the original item's data
            const originalItem = await fetchAPI(`/entities/${entityType}/${itemId}`);
            if (!originalItem) {
                throw new Error(`Failed to fetch original item ${itemId} for duplication.`);
            }

            // 2. Prepare the new item data
            const newItemData = { ...originalItem };
            delete newItemData.id; // Remove original ID, backend will assign a new one
            
            // Modify the name to indicate it's a copy
            newItemData.name = newItemData.name ? `${newItemData.name} - Copy` : "Unnamed Requirement - Copy";
            
            // Optionally, reset or modify other fields if needed, e.g., version, author for the new copy
            // newItemData.version = "1.0"; // Example: reset version for the copy
            // newItemData.author = "Current User"; // Example: set new author

            // 3. Create the new item via POST request
            const duplicatedItem = await fetchAPI(`/entities/${entityType}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newItemData)
            });

            showMessage(`Requirement ${itemId} duplicated successfully as ${duplicatedItem.id}.`, false);
            
            // 4. Clear cache and reload list to show the new item
            delete currentDataCache[entityType];
            if (entityType === 'requirements') { // NEW: Invalidate embeddings cache
                localStorage.removeItem(EMBEDDINGS_CACHE_KEY);
            }
            loadEntityList(entityType);

        } catch (error) {
            console.error(`Error duplicating item ${itemId}:`, error);
            showMessage(`Failed to duplicate item ${itemId}. ${error.message}`, true);
        }
    }
    // --- End of Duplicate Item Function ---


    // --- NEW: Solution Assessment Matrix Dashboard ---
    async function loadSolutionAssessmentMatrix() {
        currentEntityType = null; // Clear current entity type as we are viewing a dashboard
        setActiveNavButton('solution_assessment_matrix', 'dashboard');
        await renderSolutionAssessmentMatrix();
    }

    async function renderSolutionAssessmentMatrix() {
        clearContent();
        showMessage('Loading Solution Assessment Matrix...');

        try {
            // Fetch requirements and solutions data concurrently
            const [requirementsData, solutionsData] = await Promise.all([
                currentDataCache['requirements'] ? Promise.resolve(currentDataCache['requirements']) : fetchAPI('/entities/requirements'),
                currentDataCache['solutions'] ? Promise.resolve(currentDataCache['solutions']) : fetchAPI('/entities/solutions')
            ]);

            // Cache fetched data
            currentDataCache['requirements'] = requirementsData || [];
            currentDataCache['solutions'] = solutionsData || [];

            const requirements = currentDataCache['requirements'];
            const solutions = currentDataCache['solutions'];

            if (!requirements || requirements.length === 0) {
                contentArea.innerHTML = '<h2>Solution Assessment Matrix</h2><p>No requirements found to display in the matrix.</p>';
                showMessage('');
                return;
            }
            if (!solutions || solutions.length === 0) {
                contentArea.innerHTML = '<h2>Solution Assessment Matrix</h2><p>No solutions found to display in the matrix.</p>';
                showMessage('');
                return;
            }

            let html = '<h2>Solution Assessment Matrix</h2>';
            html += '<table class="assessment-matrix"><thead><tr>'; // Added class for styling
            html += '<th>ID</th>'; // NEW: First column for Requirement ID
            html += '<th>Requirement Title</th>'; 
            solutions.forEach(sol => {
                html += `<th>${escapeHTML(sol.name)}</th>`;
            });
            html += '</tr></thead><tbody>';

            requirements.forEach(req => {
                // Use requirement name if available, otherwise fallback to ID.
                const reqDisplayName = req.name ? escapeHTML(req.name) : `<em>${escapeHTML(req.id)} (No Name)</em>`;
                // NEW: Make the requirement title a link to its edit form
                const reqLink = `<a href="#" onclick="app.renderForm('requirements', '${escapeHTML(req.id)}'); return false;">${reqDisplayName}</a>`;
                html += `<tr>`;
                html += `<td>${escapeHTML(req.id)}</td>`; // NEW: Add cell for Requirement ID
                html += `<td>${reqLink}</td>`; 
                solutions.forEach(sol => {
                    const assessment = req.solution_assessments?.find(asm => asm.solution_id === sol.id);
                    // Default to "Not Assessed" emoji if no assessment or no result
                    let emoji = ASSESSMENT_OPTIONS.find(opt => opt.value === "")?.emoji || '❓'; 
                    if (assessment && assessment.result) {
                        const option = ASSESSMENT_OPTIONS.find(opt => opt.value === assessment.result);
                        if (option) {
                            emoji = option.emoji;
                        }
                    }
                    html += `<td class="assessment-cell">${emoji}</td>`; // Added class for styling cell content
                });
                html += '</tr>';
            });

            html += '</tbody></table>';
            contentArea.innerHTML = html;
            showMessage(''); // Clear loading message

        } catch (error) {
            console.error('Error rendering Solution Assessment Matrix:', error);
            showMessage(`Failed to load Solution Assessment Matrix: ${error.message}`, true);
            contentArea.innerHTML = `<p style="color:red;">Could not load the Solution Assessment Matrix.</p>`;
        }
    }
    // --- End of Solution Assessment Matrix Dashboard ---


    // --- NEW: Full Report Dashboard ---
    async function loadFullReport() {
        currentEntityType = null; // Clear current entity type
        setActiveNavButton('full_report', 'dashboard');
        await renderFullReport();
    }

    async function renderFullReport() {
        clearContent();
        showMessage('Loading Full Report...');
        contentArea.innerHTML = '<div id="full-report-content"><h2>Full Report</h2></div>'; // Add a wrapper for report content
        const reportContentEl = document.getElementById('full-report-content');

        try {
            const entityTypes = await fetchAPI('/entity_types');
            if (!entityTypes || entityTypes.length === 0) {
                reportContentEl.innerHTML += '<p>No entity types found.</p>';
                showMessage('');
                return;
            }

            // Ensure 'requirements' is first, then sort others alphabetically
            const sortedEntityTypes = ['requirements', ...entityTypes.filter(et => et !== 'requirements').sort()];

            for (const entityType of sortedEntityTypes) {
                if (!entityTypes.includes(entityType)) continue; // Skip if 'requirements' wasn't in the original list

                reportContentEl.innerHTML += `<section class="report-section" id="report-section-${entityType}"><h3>${entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h3></section>`;
                const sectionEl = document.getElementById(`report-section-${entityType}`);
                
                try {
                    const items = currentDataCache[entityType] || await fetchAPI(`/entities/${entityType}`);
                    currentDataCache[entityType] = items || [];

                    if (!items || items.length === 0) {
                        sectionEl.innerHTML += '<p>No items found for this entity type.</p>';
                        continue;
                    }

                    let sectionHtml = '';
                    if (entityType === 'requirements') {
                        // Ensure solutions data is available for assessments
                        if (!currentDataCache['solutions']) {
                            try {
                                const solutionsData = await fetchAPI('/entities/solutions');
                                currentDataCache['solutions'] = solutionsData || [];
                            } catch (solError) {
                                console.warn('Could not load solutions data for report details:', solError);
                                currentDataCache['solutions'] = []; // Default to empty if fetch fails
                            }
                        }

                        items.forEach(item => {
                            sectionHtml += '<div class="report-requirement-item">';
                            sectionHtml += `<h4>${escapeHTML(item.id)}: ${escapeHTML(item.name)}</h4>`;
                            sectionHtml += `<p><strong>Description:</strong> ${escapeHTML(item.description || '').replace(/\n/g, '<br>')}</p>`;
                            sectionHtml += `<p><strong>Type:</strong> ${escapeHTML(item.type)} | <strong>Priority:</strong> ${escapeHTML(item.priority)} | <strong>Version:</strong> ${escapeHTML(item.version)}</p>`;
                            if (item.tags && item.tags.length > 0) {
                                sectionHtml += `<p><strong>Tags:</strong> ${escapeHTML(item.tags.join(', '))}</p>`;
                            }

                            // Robust handling for related_goal_id
                            if (item.related_goal_id) {
                                let goalText = 'None';
                                if (Array.isArray(item.related_goal_id)) {
                                    if (item.related_goal_id.length > 0) {
                                        goalText = escapeHTML(item.related_goal_id.join(', '));
                                    }
                                } else if (typeof item.related_goal_id === 'string' && item.related_goal_id.trim() !== '') {
                                    goalText = escapeHTML(item.related_goal_id); // Display string directly
                                }
                                sectionHtml += `<p><strong>Related Goal(s):</strong> ${goalText}</p>`;
                            } else {
                                sectionHtml += `<p><strong>Related Goal(s):</strong> None</p>`;
                            }

                            // Robust handling for related_process_id
                            if (item.related_process_id) {
                                let processText = 'None';
                                if (Array.isArray(item.related_process_id)) {
                                    if (item.related_process_id.length > 0) {
                                        processText = escapeHTML(item.related_process_id.join(', '));
                                    }
                                } else if (typeof item.related_process_id === 'string' && item.related_process_id.trim() !== '') {
                                    processText = escapeHTML(item.related_process_id); // Display string directly
                                }
                                sectionHtml += `<p><strong>Related Process(es):</strong> ${processText}</p>`;
                            } else {
                                sectionHtml += `<p><strong>Related Process(es):</strong> None</p>`;
                            }

                            if (item.solution_assessments && item.solution_assessments.length > 0) {
                                sectionHtml += '<h5>Solution Assessments:</h5><ul>';
                                item.solution_assessments.forEach(asm => {
                                    const solution = currentDataCache['solutions']?.find(s => s.id === asm.solution_id);
                                    const solName = solution ? escapeHTML(solution.name) : `ID: ${escapeHTML(asm.solution_id)}`;
                                    const asmOpt = ASSESSMENT_OPTIONS.find(opt => opt.value === asm.result);
                                    const asmDisplay = asmOpt ? `${asmOpt.emoji} ${escapeHTML(asmOpt.display)}` : escapeHTML(asm.result);
                                    sectionHtml += `<li><strong>${solName}:</strong> ${asmDisplay} ${asm.description ? `<em>(${escapeHTML(asm.description)})</em>` : ''}</li>`;
                                });
                                sectionHtml += '</ul>';
                            }
                            // Add other key fields as needed
                            sectionHtml += '</div>';
                        });
                    } else { // Generic display for other entities
                        sectionHtml += '<ul class="report-generic-list">';
                        items.forEach(item => {
                            sectionHtml += `<li class="report-generic-item"><strong>${escapeHTML(item.name || item.id)}:</strong>`;
                            sectionHtml += '<ul>';
                            for (const key in item) {
                                if (key !== 'id' && key !== 'name' && item.hasOwnProperty(key) && item[key] !== null && String(item[key]).trim() !== '') {
                                    let value = item[key];
                                    if (typeof value === 'object') value = JSON.stringify(value, null, 2);
                                    sectionHtml += `<li><em>${escapeHTML(key.replace(/_/g, ' '))}:</em> ${escapeHTML(String(value)).replace(/\n/g, '<br>')}</li>`;
                                }
                            }
                            sectionHtml += '</ul></li>';
                        });
                        sectionHtml += '</ul>';
                    }
                    sectionEl.innerHTML += sectionHtml;

                } catch (error) {
                    console.error(`Error loading data for ${entityType} in report:`, error);
                    sectionEl.innerHTML += `<p style="color:red;">Could not load data for ${entityType}.</p>`;
                }
            }
            showMessage('Full report loaded.');
        } catch (error) {
            console.error('Error rendering Full Report:', error);
            showMessage(`Failed to load Full Report: ${error.message}`, true);
            reportContentEl.innerHTML = `<p style="color:red;">Could not load the Full Report.</p>`;
        }
    }

    // --- End of Full Report Dashboard ---


    // Modify performSearch to clear activeTagFilter and activeVersionFilter
    async function performSearch() {
        activeTagFilter = null; // Clear any active tag filter when performing a search
        activeVersionFilter = null; // Clear any active version filter

        const searchInput = document.getElementById('req-search-input');
        const searchTerm = searchInput?.value.trim();
        const searchStatus = document.getElementById('req-search-status');
        
        if (!searchTerm) {
            searchStatus.textContent = 'Please enter a search term';
            // If search term is cleared, show all requirements (respecting activeTagFilter if any - though it's cleared above)
            loadEntityList('requirements'); // This will show all if activeTagFilter is null
            return;
        }

        try {
            searchStatus.textContent = 'Searching...';
            const allRequirements = currentDataCache['requirements'] || await fetchAPI('/entities/requirements');
            const initialized = await ensureExtractorInitializedAndIndexRequirements(allRequirements);
            
            if (!initialized || !featureExtractor) {
                throw new Error('Search functionality not available');
            }

            const queryEmbedding = await featureExtractor(searchTerm, { pooling: 'mean', normalize: true });
            
            const results = [];
            for (const reqId in requirementsIndex) {
                const { embedding, requirement } = requirementsIndex[reqId];
                const similarity = cosineSimilarity(queryEmbedding.data, embedding);
                
                if (similarity > 0.3) { 
                    results.push({
                        ...requirement,
                        similarityScore: similarity
                    });
                }
            }

            results.sort((a, b) => b.similarityScore - a.similarityScore);
            
            if (results && results.length > 0) {
                renderEntityList('requirements', results); // Pass search results
                searchStatus.textContent = `Found ${results.length} matching requirements`;
            } else {
                renderEntityList('requirements', []); // Pass empty array for no results
                searchStatus.textContent = 'No matching requirements found';
            }
        } catch (error) {
            console.error('Search failed:', error);
            searchStatus.textContent = 'Search failed - see console';
            showMessage(`Search error: ${error.message}`, true);
        }
    }


    // Expose functions needed by inline HTML event handlers (onclick)
    window.app = {
        renderForm,
        deleteItem,
        loadEntityList,
        performSearch,
        applyTagFilter,
        clearTagFilter,
        applyVersionFilter,
        clearVersionFilter,
        duplicateItem,       // NEW: Expose duplicateItem
        loadSolutionAssessmentMatrix, // NEW: Expose dashboard loader
        loadFullReport // NEW: Expose full report loader
    };

    // Start the application
    // Initialize the feature extractor lazily when requirements are first viewed,
    // or potentially trigger it here if requirements are the default view.
    // For now, it's triggered by loadEntityList('requirements').
    initialize();
});
