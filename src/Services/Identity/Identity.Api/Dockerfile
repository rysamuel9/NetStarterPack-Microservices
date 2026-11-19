# ==============================================================================
# Multi-Stage Dockerfile — Identity.Api (Auth & RBAC Microservice - Port 5081)
# ==============================================================================
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["src/BuildingBlocks/BuildingBlocks.Core/BuildingBlocks.Core.csproj", "src/BuildingBlocks/BuildingBlocks.Core/"]
COPY ["src/BuildingBlocks/BuildingBlocks.Security/BuildingBlocks.Security.csproj", "src/BuildingBlocks/BuildingBlocks.Security/"]
COPY ["src/BuildingBlocks/BuildingBlocks.Infrastructure/BuildingBlocks.Infrastructure.csproj", "src/BuildingBlocks/BuildingBlocks.Infrastructure/"]
COPY ["src/Services/Identity/Identity.Api/Identity.Api.csproj", "src/Services/Identity/Identity.Api/"]

RUN dotnet restore "src/Services/Identity/Identity.Api/Identity.Api.csproj"

COPY ["src/BuildingBlocks/", "src/BuildingBlocks/"]
COPY ["src/Services/Identity/Identity.Api/", "src/Services/Identity/Identity.Api/"]

WORKDIR "/src/src/Services/Identity/Identity.Api"
RUN dotnet publish "Identity.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
EXPOSE 5081
ENV ASPNETCORE_URLS=http://+:5081
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Identity.Api.dll"]
