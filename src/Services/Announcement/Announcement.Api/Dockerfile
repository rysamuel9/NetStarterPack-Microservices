# ==============================================================================
# Multi-Stage Dockerfile — Announcement.Api (HR Newsroom & Announcements - Port 5085)
# ==============================================================================
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["src/BuildingBlocks/BuildingBlocks.Core/BuildingBlocks.Core.csproj", "src/BuildingBlocks/BuildingBlocks.Core/"]
COPY ["src/BuildingBlocks/BuildingBlocks.Security/BuildingBlocks.Security.csproj", "src/BuildingBlocks/BuildingBlocks.Security/"]
COPY ["src/BuildingBlocks/BuildingBlocks.Infrastructure/BuildingBlocks.Infrastructure.csproj", "src/BuildingBlocks/BuildingBlocks.Infrastructure/"]
COPY ["src/Services/Announcement/Announcement.Api/Announcement.Api.csproj", "src/Services/Announcement/Announcement.Api/"]

RUN dotnet restore "src/Services/Announcement/Announcement.Api/Announcement.Api.csproj"

COPY ["src/BuildingBlocks/", "src/BuildingBlocks/"]
COPY ["src/Services/Announcement/Announcement.Api/", "src/Services/Announcement/Announcement.Api/"]

WORKDIR "/src/src/Services/Announcement/Announcement.Api"
RUN dotnet publish "Announcement.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
EXPOSE 5085
ENV ASPNETCORE_URLS=http://+:5085
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Announcement.Api.dll"]
