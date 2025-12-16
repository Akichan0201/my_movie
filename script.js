// IndexedDB Database Manager
class DatabaseManager {
    constructor() {
        this.db = null;
        this.dbName = 'MovieCollectionDB';
        this.dbVersion = 1;
    }

    // Initialize IndexedDB
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                reject('Database error: ' + event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('Database initialized successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create movies store
                if (!db.objectStoreNames.contains('movies')) {
                    const movieStore = db.createObjectStore('movies', { keyPath: 'id', autoIncrement: false });
                    movieStore.createIndex('title', 'title', { unique: false });
                    movieStore.createIndex('year', 'year', { unique: false });
                    movieStore.createIndex('genre', 'genre', { unique: false });
                    movieStore.createIndex('director', 'director', { unique: false });
                    movieStore.createIndex('created_at', 'created_at', { unique: false });
                }

                // Create settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    // Get all movies
    async getAllMovies() {
        // Validate database connection
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const transaction = this.db.transaction(['movies'], 'readonly');
        const store = transaction.objectStore('movies');
        const request = store.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                const movies = event.target.result;
                console.log('📂 Retrieved', movies.length, 'movies from database');
                resolve(movies || []); // Ensure we always return an array
            };
            request.onerror = (event) => {
                console.error('❌ Database: Failed to get movies:', event.target.error);
                reject(new Error('Gagal mengambil data film: ' + event.target.error.message));
            };
        });
    }

    // Get movie by ID
    async getMovie(id) {
        const transaction = this.db.transaction(['movies'], 'readonly');
        const store = transaction.objectStore('movies');
        const request = store.get(id);

        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // Add movie
    async addMovie(movie) {
        console.log('💾 Database: Adding movie:', movie);

        // Validate database connection
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // Validate movie data
        if (!movie || typeof movie !== 'object') {
            throw new Error('Invalid movie data');
        }

        // Ensure required fields
        if (!movie.title || !movie.year || !movie.genre || !movie.director) {
            throw new Error('Missing required fields: title, year, genre, director');
        }

        const transaction = this.db.transaction(['movies'], 'readwrite');
        const store = transaction.objectStore('movies');

        // Ensure movie has ID
        if (!movie.id) {
            movie.id = Date.now();
        }

        // Add timestamps
        movie.created_at = new Date().toISOString();
        movie.updated_at = new Date().toISOString();

        console.log('🆔 Movie ID:', movie.id, 'Timestamp:', movie.created_at);

        const request = store.add(movie);

        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                console.log('✅ Database: Movie added successfully, result:', event.target.result);
                resolve(event.target.result);
            };
            request.onerror = (event) => {
                console.error('❌ Database: Failed to add movie:', event.target.error);

                // Handle specific errors
                if (event.target.error.name === 'ConstraintError') {
                    reject(new Error('Movie dengan ID ini sudah ada'));
                } else if (event.target.error.name === 'QuotaExceededError') {
                    reject(new Error('Storage penuh. Hapus beberapa film atau data lainnya'));
                } else {
                    reject(new Error('Gagal menyimpan film: ' + event.target.error.message));
                }
            };
        });
    }

    // Update movie
    async updateMovie(id, updates) {
        const transaction = this.db.transaction(['movies'], 'readwrite');
        const store = transaction.objectStore('movies');

        // Get existing movie
        const getRequest = store.get(id);

        return new Promise((resolve, reject) => {
            getRequest.onsuccess = (event) => {
                const movie = event.target.result;
                if (movie) {
                    Object.assign(movie, updates);
                    movie.updated_at = new Date().toISOString();
                    const updateRequest = store.put(movie);
                    updateRequest.onsuccess = () => resolve(movie);
                    updateRequest.onerror = (event) => reject(event.target.error);
                } else {
                    reject(new Error('Movie not found'));
                }
            };
            getRequest.onerror = (event) => reject(event.target.error);
        });
    }

    // Delete movie
    async deleteMovie(id) {
        const transaction = this.db.transaction(['movies'], 'readwrite');
        const store = transaction.objectStore('movies');
        const request = store.delete(id);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(true);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // Search movies with advanced filtering
    async searchMovies(filters = {}) {
        const transaction = this.db.transaction(['movies'], 'readonly');
        const store = transaction.objectStore('movies');
        const request = store.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                let movies = event.target.result;

                // Apply filters
                if (filters.search) {
                    const query = filters.search.toLowerCase();
                    movies = movies.filter(movie =>
                        movie.title.toLowerCase().includes(query) ||
                        movie.genre.toLowerCase().includes(query) ||
                        movie.director.toLowerCase().includes(query)
                    );
                }

                if (filters.genre && filters.genre !== 'all') {
                    movies = movies.filter(movie =>
                        movie.genre.toLowerCase().includes(filters.genre.toLowerCase())
                    );
                }

                if (filters.year) {
                    movies = movies.filter(movie => movie.year === parseInt(filters.year));
                }

                if (filters.yearRange) {
                    const [min, max] = filters.yearRange;
                    movies = movies.filter(movie => movie.year >= min && movie.year <= max);
                }

                if (filters.director) {
                    movies = movies.filter(movie =>
                        movie.director.toLowerCase().includes(filters.director.toLowerCase())
                    );
                }

                // Apply sorting
                if (filters.sortBy) {
                    movies.sort((a, b) => {
                        switch(filters.sortBy) {
                            case 'title-asc':
                                return a.title.localeCompare(b.title);
                            case 'title-desc':
                                return b.title.localeCompare(a.title);
                            case 'year-asc':
                                return a.year - b.year;
                            case 'year-desc':
                                return b.year - a.year;
                            case 'created-asc':
                                return new Date(a.created_at) - new Date(b.created_at);
                            case 'created-desc':
                                return new Date(b.created_at) - new Date(a.created_at);
                            default:
                                return 0;
                        }
                    });
                }

                // Apply pagination
                if (filters.offset || filters.limit) {
                    const offset = filters.offset || 0;
                    const limit = filters.limit || 50;
                    movies = movies.slice(offset, offset + limit);
                }

                resolve(movies);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // Get statistics
    async getStats() {
        const movies = await this.getAllMovies();

        const stats = {
            totalMovies: movies.length,
            genres: {},
            years: {},
            directors: {}
        };

        movies.forEach(movie => {
            // Count genres
            movie.genre.split(',').forEach(genre => {
                const g = genre.trim();
                stats.genres[g] = (stats.genres[g] || 0) + 1;
            });

            // Count years
            stats.years[movie.year] = (stats.years[movie.year] || 0) + 1;

            // Count directors
            stats.directors[movie.director] = (stats.directors[movie.director] || 0) + 1;
        });

        return stats;
    }

    // Save setting
    async saveSetting(key, value) {
        const transaction = this.db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');
        const request = store.put({ key, value, updated_at: new Date().toISOString() });

        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(true);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // Get setting
    async getSetting(key) {
        const transaction = this.db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get(key);

        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                const result = event.target.result;
                resolve(result ? result.value : null);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // Clear all data
    async clearAll() {
        const movieTransaction = this.db.transaction(['movies'], 'readwrite');
        const movieStore = movieTransaction.objectStore('movies');
        const movieRequest = movieStore.clear();

        const settingsTransaction = this.db.transaction(['settings'], 'readwrite');
        const settingsStore = settingsTransaction.objectStore('settings');
        const settingsRequest = settingsStore.clear();

        return new Promise((resolve, reject) => {
            let completed = 0;
            const total = 2;

            movieRequest.onsuccess = () => {
                completed++;
                if (completed === total) resolve(true);
            };

            settingsRequest.onsuccess = () => {
                completed++;
                if (completed === total) resolve(true);
            };

            [movieRequest, settingsRequest].forEach(request => {
                request.onerror = (event) => reject(event.target.error);
            });
        });
    }
}

// Movie Collection Manager
class MovieManager {
    constructor() {
        this.db = new DatabaseManager();
        this.movies = [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.init();
    }

    async init() {
        try {
            // Initialize database
            await this.db.initDB();

            // Check if we need to migrate from localStorage
            await this.migrateFromLocalStorage();

            // Load data
            await this.loadMovies();

            // Setup UI
            this.setupEventListeners();
            this.displayMovies();
            this.updateGenreFilter();
            this.updateMovieCount();

        } catch (error) {
            console.error('Initialization error:', error);
            this.showNotification('Failed to initialize application', 'error');
        }
    }

    // Migrate data from localStorage to IndexedDB
    async migrateFromLocalStorage() {
        const localStorageData = localStorage.getItem('myMovies');

        if (localStorageData) {
            try {
                const movies = JSON.parse(localStorageData);

                // Check if database already has data
                const existingMovies = await this.db.getAllMovies();

                if (existingMovies.length === 0 && movies.length > 0) {
                    // Migrate to IndexedDB
                    for (const movie of movies) {
                        await this.db.addMovie(movie);
                    }

                    console.log(`Migrated ${movies.length} movies from localStorage to IndexedDB`);
                    this.showNotification(`Successfully migrated ${movies.length} movies to new database system`, 'success');
                }

                // Clear localStorage after migration
                localStorage.removeItem('myMovies');

            } catch (error) {
                console.error('Migration error:', error);
                this.showNotification('Failed to migrate existing data', 'error');
            }
        }
    }

    // Load movies from IndexedDB
    async loadMovies() {
        try {
            console.log('📂 Loading movies from database...');

            // Validate database is initialized
            if (!this.db || !this.db.db) {
                throw new Error('Database not initialized');
            }

            const movies = await this.db.getAllMovies();

            // Validate loaded data
            if (!Array.isArray(movies)) {
                console.error('❌ Invalid data format received from database:', movies);
                this.movies = [];
                throw new Error('Invalid data format from database');
            }

            this.movies = movies.filter(movie => {
                // Filter out invalid movie entries
                return movie &&
                       typeof movie === 'object' &&
                       movie.id &&
                       movie.title;
            });

            console.log('📊 Loaded', this.movies.length, 'valid movies from database');
            console.log('🎬 Movie data sample:', this.movies.slice(0, 3)); // Show first 3 movies

            // Trigger display update if we're in the browser context
            if (typeof document !== 'undefined') {
                this.displayMovies();
            }

        } catch (error) {
            console.error('❌ Error loading movies:', error);
            this.movies = [];

            // Show notification only if in browser context
            if (typeof document !== 'undefined') {
                this.showNotification('Gagal memuat film: ' + error.message, 'error');

                // Ensure empty state is shown
                this.displayMovies([]);
            }
        }
    }

    // Save movie to IndexedDB
    async saveMovieToDB(movie) {
        try {
            const existingMovie = await this.db.getMovie(movie.id);
            if (existingMovie) {
                return await this.db.updateMovie(movie.id, movie);
            } else {
                return await this.db.addMovie(movie);
            }
        } catch (error) {
            console.error('Error saving movie:', error);
            throw error;
        }
    }

    // Setup real-time form validation - NEW FUNCTION
    setupRealTimeValidation() {
        console.log('⚡ Setting up real-time validation...');

        // Title validation
        const titleInput = document.getElementById('title');
        titleInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            if (value.length === 0) {
                this.setFieldValidation(titleInput, false, 'Judul film wajib diisi');
            } else if (value.length < 2) {
                this.setFieldValidation(titleInput, false, 'Judul minimal 2 karakter');
            } else {
                this.setFieldValidation(titleInput, true, 'Valid');
            }
        });

        // Year validation
        const yearInput = document.getElementById('year');
        yearInput.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            if (isNaN(value)) {
                this.setFieldValidation(yearInput, false, 'Tahun harus angka');
            } else if (value < 1900 || value > 2030) {
                this.setFieldValidation(yearInput, false, 'Tahun harus 1900-2030');
            } else {
                this.setFieldValidation(yearInput, true, 'Valid');
            }
        });

        // Genre validation
        const genreInput = document.getElementById('genre');
        genreInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            if (value.length === 0) {
                this.setFieldValidation(genreInput, false, 'Genre wajib diisi');
            } else {
                this.setFieldValidation(genreInput, true, 'Valid');
            }
        });

        // Director validation
        const directorInput = document.getElementById('director');
        directorInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            if (value.length === 0) {
                this.setFieldValidation(directorInput, false, 'Sutradara wajib diisi');
            } else if (value.length < 2) {
                this.setFieldValidation(directorInput, false, 'Nama minimal 2 karakter');
            } else {
                this.setFieldValidation(directorInput, true, 'Valid');
            }
        });

        // Poster URL validation (optional)
        const posterInput = document.getElementById('poster');
        posterInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            if (value === '') {
                this.setFieldValidation(posterInput, true, 'Opsional'); // Empty is valid
            } else if (!this.isValidUrl(value)) {
                this.setFieldValidation(posterInput, false, 'URL tidak valid');
            } else {
                this.setFieldValidation(posterInput, true, 'URL valid');
            }
        });
    }

    // Set field validation state - NEW FUNCTION
    setFieldValidation(input, isValid, message) {
        if (isValid) {
            input.classList.remove('invalid');
            input.classList.add('valid');
            input.style.borderColor = '#4CAF50';
            input.title = message;
        } else {
            input.classList.remove('valid');
            input.classList.add('invalid');
            input.style.borderColor = '#f44336';
            input.title = message;
        }
    }

    // Validate URL format - NEW FUNCTION
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    // Validate image URL - NEW FUNCTION
    isValidImageUrl(url) {
        if (!url || typeof url !== 'string') return false;

        // Check if it's a valid URL
        if (!this.isValidUrl(url)) return false;

        // Check if it's an image file extension
        const imageExtensions = /\.(jpg|jpeg|png|gif|bmp|webp)(\?.*)?$/i;
        return imageExtensions.test(url) ||
               url.includes('amazon.com/images/') ||
               url.includes('imdb.com/title/') ||
               url.includes('themoviedb.org/t/p/') ||
               url.includes('image.tmdb.org/') ||
               url.includes('movieposter.db');
    }

    // Handle problematic image URLs - NEW FUNCTION
    addProxyIfNeeded(url) {
        try {
            const urlObj = new URL(url);

            // List of domains that commonly cause tracking prevention issues
            const problematicDomains = [
                'amazon.com',
                'imdb.com',
                'facebook.com',
                'instagram.com',
                'twitter.com'
            ];

            // For problematic domains, add cache-busting and better headers
            if (problematicDomains.some(domain => urlObj.hostname.includes(domain))) {
                // Add cache busting to avoid tracking prevention
                const separator = url.includes('?') ? '&' : '?';
                return `${url}${separator}t=${Date.now()}`;
            }

            return url;
        } catch (e) {
            console.warn('Invalid URL for processing:', url);
            return url;
        }
    }

    // Generate movie poster with robust error handling - NEW FUNCTION
    generateMoviePoster(movie) {
        if (!movie.poster || !this.isValidImageUrl(movie.poster)) {
            return '<div class="no-poster">🎬</div>';
        }

        try {
            // Process URL for better loading
            const processedUrl = this.addProxyIfNeeded(movie.poster);

            return `<img src="${processedUrl}"
                     alt="${this.escapeHtml(movie.title)}"
                     loading="lazy"
                     onerror="this.parentElement.classList.add('no-poster'); this.remove(); console.warn('❌ Failed to load poster:', '${this.escapeHtml(processedUrl)}');"
                     onload="this.parentElement.classList.remove('no-poster'); console.log('✅ Poster loaded successfully:', '${this.escapeHtml(movie.title)}');">`;
        } catch (e) {
            console.warn('⚠️ Error processing poster URL:', movie.poster, e);
            return '<div class="no-poster">🎬</div>';
        }
    }

    // Setup event listeners
    setupEventListeners() {
        console.log('🔧 Setting up event listeners...');

        // Add movie button
        const addBtn = document.getElementById('addMovieBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                console.log('➕ Add movie button clicked');
                this.openModal();
            });
        }

        // Modal close
        const closeBtn = document.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                console.log('❌ Close button clicked');
                this.closeModal();
            });
        }

        // Cancel button
        const cancelBtn = document.querySelector('.cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                console.log('🚫 Cancel button clicked');
                this.closeModal();
            });
        }

        // Form submit
        const movieForm = document.getElementById('movieForm');
        if (movieForm) {
            movieForm.addEventListener('submit', (e) => {
                console.log('📋 Form submit triggered!');
                console.log('📋 Form elements:', {
                    title: document.getElementById('title').value,
                    year: document.getElementById('year').value,
                    genre: document.getElementById('genre').value,
                    director: document.getElementById('director').value,
                    poster: document.getElementById('poster').value,
                    movieId: document.getElementById('movieId').value
                });
                e.preventDefault();
                this.saveMovie();
            });
            console.log('✅ Form submit listener attached');
        } else {
            console.error('❌ movieForm not found!');
        }

        // REAL-TIME FORM VALIDATION - NEW
        this.setupRealTimeValidation();

        // Search input with debounce
        let searchTimeout;
        document.getElementById('searchInput').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.searchQuery = e.target.value;
                this.filterAndDisplayMovies();
            }, 300);
        });

        // Import/Export buttons
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });

        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportMovies();
        });

        document.getElementById('importFile').addEventListener('change', (e) => {
            this.importMovies(e.target.files[0]);
        });

        // Backup button
        document.getElementById('backupBtn').addEventListener('click', () => {
            this.createBackup();
        });

        document.getElementById('backupFile').addEventListener('change', (e) => {
            this.restoreBackup(e.target.files[0]);
        });

        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('movieModal');
            if (e.target === modal) {
                this.closeModal();
            }
        });
    }

    // Display movies
    displayMovies(moviesToDisplay = this.movies) {
        console.log('🎨 DisplayMovies called with', moviesToDisplay.length, 'movies');
        console.log('📋 Total movies in array:', this.movies.length);

        // Validate DOM elements exist
        const grid = document.getElementById('moviesGrid');
        const emptyState = document.getElementById('emptyState');
        const noResults = document.getElementById('noResults');
        const loading = document.getElementById('loading');

        if (!grid || !emptyState || !noResults || !loading) {
            console.error('❌ Required DOM elements not found!');
            return;
        }

        // Hide loading
        loading.style.display = 'none';

        // Handle empty collection
        if (!this.movies || this.movies.length === 0) {
            console.log('📭 No movies in collection, showing empty state');
            grid.style.display = 'none';
            grid.innerHTML = '';
            emptyState.style.display = 'block';
            noResults.style.display = 'none';
            this.updateMovieCount();
            return;
        }

        // Handle no search results
        if (!moviesToDisplay || moviesToDisplay.length === 0) {
            console.log('🔍 No movies match search/filter criteria');
            grid.style.display = 'none';
            grid.innerHTML = '';
            emptyState.style.display = 'none';
            noResults.style.display = 'block';
            this.updateMovieCount();
            return;
        }

        console.log('✨ Displaying', moviesToDisplay.length, 'movies');
        console.log('🎬 First movie to display:', moviesToDisplay[0]);

        // Show grid and hide states
        grid.style.display = 'grid';
        emptyState.style.display = 'none';
        noResults.style.display = 'none';

        // Generate HTML for movies with validation
        const moviesHTML = moviesToDisplay.map(movie => {
            // Validate movie data
            if (!movie || !movie.id || !movie.title) {
                console.warn('⚠️ Invalid movie data:', movie);
                return '';
            }

            return `
                <div class="movie-card" data-id="${movie.id}">
                    <div class="movie-poster">
                        ${this.generateMoviePoster(movie)}
                    </div>
                    <div class="movie-info">
                        <h3 class="movie-title">${this.escapeHtml(movie.title)}</h3>
                        <p class="movie-year">${movie.year || 'N/A'}</p>
                        <span class="movie-genre">${this.escapeHtml(movie.genre || 'Unknown')}</span>
                        <p class="movie-director">Director: ${this.escapeHtml(movie.director || 'Unknown')}</p>
                        <div class="movie-actions">
                            <button class="edit-btn" onclick="movieManager.editMovie(${movie.id})">Edit</button>
                            <button class="delete-btn" onclick="movieManager.deleteMovie(${movie.id})">Hapus</button>
                        </div>
                    </div>
                </div>
            `;
        }).filter(html => html !== '').join('');

        // Set grid content
        grid.innerHTML = moviesHTML;

        // Update count
        this.updateMovieCount();

        console.log('🎉 Display completed successfully');
    }

    // Utility function to escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Generate star rating display
    generateStars(rating) {
        const fullStars = Math.floor(rating / 2);
        const halfStar = (rating / 2) % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

        let stars = '';
        for (let i = 0; i < fullStars; i++) {
            stars += '<span class="star">★</span>';
        }
        if (halfStar) {
            stars += '<span class="star">☆</span>';
        }
        for (let i = 0; i < emptyStars; i++) {
            stars += '<span class="star" style="opacity: 0.3">☆</span>';
        }

        return stars;
    }

    // Open modal for add/edit
    openModal(movie = null) {
        const modal = document.getElementById('movieModal');
        const modalTitle = document.getElementById('modalTitle');
        const form = document.getElementById('movieForm');

        // Reset form with clear
        form.reset();
        this.clearFormValidation();

        if (movie) {
            // Edit mode
            modalTitle.textContent = 'Edit Film';
            document.getElementById('movieId').value = movie.id;
            document.getElementById('title').value = movie.title || '';
            document.getElementById('year').value = movie.year || '';
            document.getElementById('genre').value = movie.genre || '';
            document.getElementById('director').value = movie.director || '';
            document.getElementById('poster').value = movie.poster || '';
        } else {
            // Add mode
            modalTitle.textContent = 'Tambah Film Baru';
            document.getElementById('movieId').value = '';
        }

        modal.style.display = 'block';
        console.log('🚀 Modal opened:', movie ? 'Edit mode' : 'Add mode');
    }

    // Clear form validation states
    clearFormValidation() {
        const inputs = document.querySelectorAll('#movieForm input');
        inputs.forEach(input => {
            input.classList.remove('invalid');
            input.style.borderColor = '';
        });
    }

    // Close modal
    closeModal() {
        document.getElementById('movieModal').style.display = 'none';
        this.resetForm();
    }

    // Validate movie form - NEW FUNCTION
    validateMovieForm() {
        const title = document.getElementById('title').value.trim();
        const year = document.getElementById('year').value;
        const genre = document.getElementById('genre').value.trim();
        const director = document.getElementById('director').value.trim();

        // Check required fields
        if (!title) {
            return { isValid: false, message: 'Judul film wajib diisi!' };
        }

        if (!year || isNaN(year) || year < 1900 || year > 2030) {
            return { isValid: false, message: 'Tahun harus antara 1900-2030!' };
        }

        if (!genre) {
            return { isValid: false, message: 'Genre film wajib diisi!' };
        }

        if (!director) {
            return { isValid: false, message: 'Nama sutradara wajib diisi!' };
        }

        return { isValid: true, message: 'Form valid' };
    }

    // Set form loading state - NEW FUNCTION
    setFormLoadingState(isLoading) {
        const submitBtn = document.querySelector('.submit-btn');
        const formInputs = document.querySelectorAll('#movieForm input[type="text"], #movieForm input[type="number"], #movieForm input[type="url"]');

        if (isLoading) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Menyimpan...';
            submitBtn.classList.add('loading');
            formInputs.forEach(input => input.disabled = true);
        } else {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Simpan';
            submitBtn.classList.remove('loading');
            formInputs.forEach(input => input.disabled = false);
        }
    }

    // Reset form - NEW FUNCTION
    resetForm() {
        const form = document.getElementById('movieForm');
        form.reset();
        document.getElementById('movieId').value = '';

        // Remove validation classes
        const inputs = form.querySelectorAll('input');
        inputs.forEach(input => {
            input.classList.remove('invalid', 'valid');
        });
    }

    // Save movie (add or edit) - ENHANCED VERSION
    async saveMovie() {
        try {
            console.log('🎬 Save movie started');

            // 1. VALIDATE FORM FIRST
            const validationResult = this.validateMovieForm();
            if (!validationResult.isValid) {
                this.showNotification(validationResult.message, 'error');
                return;
            }

            // 2. COLLECT AND PREPARE MOVIE DATA
            const movieId = document.getElementById('movieId').value;
            const movieData = {
                title: document.getElementById('title').value.trim(),
                year: parseInt(document.getElementById('year').value),
                genre: document.getElementById('genre').value.trim(),
                director: document.getElementById('director').value.trim(),
                poster: document.getElementById('poster').value.trim() || null
            };

            console.log('📝 Movie data collected:', movieData);

            // 3. SET MOVIE ID
            if (movieId) {
                movieData.id = parseInt(movieId);
            } else {
                movieData.id = Date.now();
            }

            // 4. SHOW LOADING STATE
            this.setFormLoadingState(true);

            // 5. SAVE TO DATABASE
            console.log('💾 Saving to database...');
            await this.saveMovieToDB(movieData);
            console.log('✅ Movie saved to database with ID:', movieData.id);

            // 6. CRITICAL: Reload movies from database to update local array
            console.log('📂 Reloading movies from database...');
            await this.loadMovies();
            console.log('📊 Total movies in local array:', this.movies.length);
            console.log('🎬 Latest movie data:', this.movies[this.movies.length - 1]);

            // 7. Update UI components
            this.updateGenreFilter();

            // 8. Use displayMovies directly with fresh data instead of filterAndDisplayMovies
            console.log('🔄 Displaying fresh movie data...');
            this.displayMovies(this.movies);

            // 9. CLOSE MODAL AND RESET STATE
            this.closeModal();
            this.setFormLoadingState(false);

            // 10. Show success message
            const successMessage = movieId ? 'Film berhasil diperbarui!' : 'Film berhasil ditambahkan!';
            this.showNotification(successMessage, 'success');
            console.log('🎉 Save movie completed successfully');

        } catch (error) {
            console.error('❌ Error saving movie:', error);
            this.setFormLoadingState(false);

            // Show specific error messages in Indonesian
            let errorMessage = 'Gagal menyimpan film';
            if (error.name === 'ConstraintError') {
                errorMessage = 'Film dengan ID ini sudah ada';
            } else if (error.name === 'QuotaExceededError') {
                errorMessage = 'Storage penuh, hapus beberapa film terlebih dahulu';
            } else if (error.name === 'InvalidStateError') {
                errorMessage = 'Database tidak tersedia, refresh halaman';
            } else if (error.message) {
                errorMessage = error.message;
            }

            this.showNotification(errorMessage, 'error');
        }
    }

    // Edit movie
    editMovie(id) {
        const movie = this.movies.find(m => m.id === id);
        if (movie) {
            this.openModal(movie);
        }
    }

    // Delete movie
    async deleteMovie(id) {
        if (confirm('Apakah Anda yakin ingin menghapus film ini?')) {
            try {
                await this.db.deleteMovie(id);
                await this.loadMovies();
                this.updateGenreFilter();
                this.filterAndDisplayMovies();
                this.showNotification('Film berhasil dihapus!', 'success');
            } catch (error) {
                console.error('Error deleting movie:', error);
                this.showNotification('Failed to delete movie', 'error');
            }
        }
    }

    // Filter and display movies (using IndexedDB for better performance)
    async filterAndDisplayMovies() {
        try {
            console.log('🔍 FilterAndDisplayMovies called');
            const filters = {
                search: this.searchQuery || undefined,
                genre: this.currentFilter !== 'all' ? this.currentFilter : undefined
            };

            console.log('🎯 Filters applied:', filters);
            const filtered = await this.db.searchMovies(filters);
            console.log('📊 Filtered result:', filtered.length, 'movies');
            this.displayMovies(filtered);
        } catch (error) {
            console.error('❌ Error filtering movies:', error);
            // Fallback to client-side filtering
            console.log('🔄 Using fallback filtering method');
            this.filterAndDisplayMoviesFallback();
        }
    }

    // Fallback filtering method
    filterAndDisplayMoviesFallback() {
        console.log('🔄 Fallback filtering method called');
        console.log('📋 Total movies available:', this.movies.length);
        let filtered = this.movies;

        // Apply genre filter
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(movie =>
                movie.genre.toLowerCase().includes(this.currentFilter.toLowerCase())
            );
            console.log('🎭 Genre filter applied, result:', filtered.length, 'movies');
        }

        // Apply search filter
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(movie =>
                movie.title.toLowerCase().includes(query) ||
                movie.genre.toLowerCase().includes(query) ||
                movie.director.toLowerCase().includes(query)
            );
            console.log('🔍 Search filter applied, result:', filtered.length, 'movies');
        }

        console.log('📊 Final filtered result:', filtered.length, 'movies');
        this.displayMovies(filtered);
    }

    // Update genre filter buttons
    updateGenreFilter() {
        const genres = new Set();
        genres.add('all');

        this.movies.forEach(movie => {
            movie.genre.split(',').forEach(genre => {
                genres.add(genre.trim());
            });
        });

        const genreTagsContainer = document.getElementById('genreTags');
        genreTagsContainer.innerHTML = Array.from(genres).map(genre =>
            `<button class="genre-tag ${genre === this.currentFilter ? 'active' : ''}" data-genre="${genre}">${genre}</button>`
        ).join('');

        // Add click listeners to genre tags
        document.querySelectorAll('.genre-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                this.currentFilter = tag.dataset.genre;
                document.querySelectorAll('.genre-tag').forEach(t => t.classList.remove('active'));
                tag.classList.add('active');
                this.filterAndDisplayMovies();
            });
        });
    }

    // Update movie count
    updateMovieCount() {
        const count = this.movies ? this.movies.length : 0;
        const countElement = document.getElementById('movieCount');

        if (countElement) {
            // Indonesian pluralization
            const text = count === 0 ? 'Belum ada film' :
                         count === 1 ? '1 film' :
                         `${count} film`;
            countElement.textContent = text;
        }
    }

    // Theme management (now using IndexedDB)
    // Theme functions removed - Dark mode only

    // Import/Export functionality
    async exportMovies() {
        try {
            if (this.movies.length === 0) {
                this.showNotification('Tidak ada film untuk diekspor!', 'error');
                return;
            }

            const dataStr = JSON.stringify(this.movies, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `movie-collection-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);

            this.showNotification('Koleksi film berhasil diekspor!', 'success');
        } catch (error) {
            console.error('Error exporting movies:', error);
            this.showNotification('Failed to export movies', 'error');
        }
    }

    async importMovies(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedMovies = JSON.parse(e.target.result);
                if (!Array.isArray(importedMovies)) {
                    throw new Error('Invalid format');
                }

                // Validate and merge movies
                const validMovies = importedMovies.filter(movie =>
                    movie.title && movie.year && movie.genre && movie.director
                );

                if (validMovies.length === 0) {
                    throw new Error('Tidak ada film valid dalam file');
                }

                // Get existing movies to avoid duplicates
                const existingMovies = await this.db.getAllMovies();
                const existingIds = new Set(existingMovies.map(m => m.id));
                const newMovies = validMovies.filter(m => !existingIds.has(m.id));

                // Add new movies to database
                let importedCount = 0;
                for (const movie of newMovies) {
                    try {
                        await this.db.addMovie(movie);
                        importedCount++;
                    } catch (error) {
                        console.error('Error importing movie:', movie, error);
                    }
                }

                // Reload movies from database
                await this.loadMovies();
                this.updateGenreFilter();
                this.filterAndDisplayMovies();

                this.showNotification(`Berhasil mengimport ${importedCount} film baru!`, 'success');
            } catch (error) {
                console.error('Import error:', error);
                this.showNotification('Gagal mengimport file. Pastikan format JSON benar!', 'error');
            }
        };

        reader.readAsText(file);
        // Clear file input
        document.getElementById('importFile').value = '';
    }

    // Backup and restore functionality
    async createBackup() {
        try {
            const backupData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                data: {
                    movies: this.movies
                }
            };

            const dataStr = JSON.stringify(backupData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `movie-backup-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);

            this.showNotification('Backup berhasil dibuat!', 'success');
        } catch (error) {
            console.error('Error creating backup:', error);
            this.showNotification('Gagal membuat backup', 'error');
        }
    }

    async restoreBackup(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backupData = JSON.parse(e.target.result);

                // Validate backup format
                if (!backupData.data || !backupData.data.movies) {
                    throw new Error('Invalid backup format');
                }

                // Clear existing data
                await this.db.clearAll();

                // Restore movies
                const movies = backupData.data.movies;
                for (const movie of movies) {
                    try {
                        await this.db.addMovie(movie);
                    } catch (error) {
                        console.error('Error restoring movie:', movie, error);
                    }
                }

                // Restore settings
                if (backupData.data.settings) {
                    const settings = backupData.data.settings;
                    for (const [key, value] of Object.entries(settings)) {
                        try {
                            await this.db.saveSetting(key, value);
                        } catch (error) {
                            console.error('Error restoring setting:', key, value, error);
                        }
                    }
                }

                // Reload data
                await this.loadMovies();
                this.updateGenreFilter();
                this.filterAndDisplayMovies();

                this.showNotification(`Berhasil restore ${movies.length} film dan pengaturan!`, 'success');
            } catch (error) {
                console.error('Restore error:', error);
                this.showNotification('Gagal restore backup. Pastikan file valid!', 'error');
            }
        };

        reader.readAsText(file);
        // Clear file input
        document.getElementById('backupFile').value = '';
    }

    // Show notification
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4ecdc4' : '#ff6b6b'};
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            z-index: 2000;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Initialize the movie manager
const movieManager = new MovieManager();